'use strict'
const googleMapsClient = require('@google/maps').createClient({
  key: '' // TODO pegar la clave de los servicios de goole Maps en las comillas simples
})
const azure = require('azure-storage')
const tableService = azure.createTableService('') // TODO pegar la clave de acceso a la cuenta de almacenamiento entre las comillas

module.exports.nuevo = function (context, req) {
  darEntidades(req.params.pedidoId, req.params.bodegaId)
    .then(entidades => {
      return procesarEnvio(entidades.bodega, entidades.pedido, req.body)
    })
    .then(envioCrear => {
      context.log('El envio a crear es: ' + JSON.stringify(envioCrear))
      context.bindings.crearEnvios = [envioCrear]
      context.done(null, {
        body: envioCrear
      })
    })
    .catch(err => {
      const errCrearEnviosMsg = 'Ha ocurrido un error al crear envio: ' + err
      context.log.error(errCrearEnviosMsg)
      context.done(null, {
        status:400,
        body: errCrearEnviosMsg
      })
    })
}

function procesarEnvio (bodega, pedido, dataEnvio) {
  return new Promise((resolve, reject) => {
    darDirecciones(JSON.parse(bodega.ubicacionGeografica._.trim()),
      JSON.parse(pedido.ubicacionGeografica._.trim()))
      .then(nDirecciones => {
        const distancia = nDirecciones.distance.text
        const duracion = nDirecciones.duration.text
        const direcciones = darFormatoDirecciones(nDirecciones.steps)
        resolve(darParametrosCrearEnvio(pedido.PartitionKey._, bodega.PartitionKey._,
          dataEnvio, direcciones, distancia, duracion))
      })
      .catch(err => reject(err))
  })
}
function darParametrosCrearEnvio (pedidoId, bodegaId, data, direcciones, distancia, duracion) {
  return {
    'PartitionKey': pedidoId,
    'bodegaId': bodegaId,
    'RowKey': data.conductorId,
    'fechaDeEntrega': data.fechaDeEntrega,
    'fechaDeSalida': data.fechaDeSalida,
    'ruta': direcciones,
    'distancia': distancia,
    'duracion': duracion
  }
}
function darFormatoDirecciones (pasos) {
  const ubicaciones = []
  pasos.forEach(function (step) {
    ubicaciones.push({
      inicio: {
        latitud: step.start_location.lat,
        longitud: step.start_location.lng
      },
      fin: {
        latitud: step.end_location.lat,
        longitud: step.end_location.lng
      }
    })
  })
  return ubicaciones
}

function darDirecciones (origen, destino) {
  return new Promise((res, rej) => {
    googleMapsClient.directions({
      origin: origen.latitud.toString() + ',' + origen.longitud.toString(),
      destination: destino.latitud.toString() + ',' + destino.longitud.toString()
    }, (err, respuesta) => {
      if (err) {
        rej(new Error('Ha ocurrido un error en gogle maps: ' + err))
      } else if (respuesta.status !== 200 || respuesta.json.status !== 'OK') {
        rej(new Error('La solicitud de direccion no ha tenido resultados viables: ' + JSON.stringify(respuesta)))
      } else {
        res(respuesta.json.routes[0].legs[0])
      }
    })
  })
}
function darEntidades (pedidoId, bodegaId) {
  return new Promise((resolve, reject) => {
    const querys = []
    querys.push(buscarEntidad('Pedido', pedidoId))
    querys.push(buscarEntidad('Bodega', bodegaId))
    Promise.all(querys)
      .then(data => resolve({
        pedido: data[0],
        bodega: data[1]
      }))
      .catch(err => reject(err))
  })
}
function buscarEntidad (nombreTabla, partitionKey) {
  return new Promise((resolve, reject) => {
    tableService.retrieveEntity(nombreTabla, partitionKey,'', (err, result) => {
      if (err) {
        reject('Error en BD: ' + err)
      } else {
        resolve(result)
      }
    })
  })
}