'use strict'
const aws = require('aws-sdk')
const dynamoDb = new aws.DynamoDB.DocumentClient()
const googleMapsClient = require('@google/maps').createClient({
  key: '' // TODO asignar clave Google API
})
module.exports.crear = function (event, context, callback) {
  const data = JSON.parse(event.body)
  const pedidoId = event.pathParameters.pedidoId
  const bodegaId = event.pathParameters.bodegaId
  if (bodegaId && pedidoId && data) {
    let parametros = null
    procesarEnvio(bodegaId, pedidoId, data, parametros)
      .then(nData => {
        callback(null, nData)
      })
      .catch(err => {
        console.log('Ha ocurrido un error al crear envio: ' + err)
        if (parametros) {
          console.log('Los parametros: ' + parametros)
        }
        callback(new Error('Ha ocurrido un error al crear envio: ' + err))
      })
  } else {
    console.log('Error con pathparameters, data:', data, 'pedidoId:', pedidoId,
      'bodegaId', bodegaId)
    callback(new Error('No se encontraron los parametros de ruta necesarios'))
  }
}
function procesarEnvio (bodegaId, pedidoId, data, parametros) {
  let ubicaconBodega
  let distancia
  let duracion
  return darUbicacion(bodegaId)
    .then(nUbicacion => {
      ubicaconBodega = nUbicacion
      return darUbicacion(null, pedidoId)
    })
    .then(ubicacionPedido => {
      return procesarRuta(ubicaconBodega.Item.ubicacionGeografica, ubicacionPedido.Item.ubicacionGeografica)
    })
    .then(nDirecciones => {
      distancia = nDirecciones.json.routes[0].legs[0].distance.text
      duracion = nDirecciones.json.routes[0].legs[0].duration.text
      const direcciones = darFormatoDirecciones(nDirecciones.json.routes[0].legs[0].steps)
      parametros = darParametrosCrearEnvio(pedidoId, bodegaId, data, direcciones, distancia, duracion)
      return dynamoDb.put(parametros).promise()
    })
}
function darParametrosCrearEnvio (pedidoId, bodegaId, data, direcciones, distancia, duracion) {
  return {
    TableName: 'Envio',
    Item: {
      'pedidoId': pedidoId,
      'bodegaId': bodegaId,
      'conductorId': data.conductorId,
      'fechaDeEntrega': data.fechaDeEntrega,
      'fechaDeSalida': data.fechaDeSalida,
      'ruta': direcciones,
      'distancia': distancia,
      'duracion': duracion
    }
  }
}
function procesarRuta (bodegaUbicacion, pedidoUbicacion) {
  const destino = bodegaUbicacion.latitud.toString() + ',' +
    bodegaUbicacion.longitud.toString()
  const origen = pedidoUbicacion.latitud.toString() + ',' +
    pedidoUbicacion.longitud.toString()
  return darDirecciones(origen, destino)
}
function darUbicacion (bodegaId, pedidoId) {
  let nombreTabla = 'Bodega'
  let itembuscado = bodegaId
  if (pedidoId) {
    nombreTabla = 'Pedido'
    itembuscado = pedidoId
  }
  const params = {
    TableName: nombreTabla,
    Key: {
      '_id': itembuscado
    },
    ProjectionExpression: 'ubicacionGeografica'
  }
  return dynamoDb.get(params).promise()
}
function darFormatoDirecciones (steps) {
  const ubicaciones = []
  steps.forEach(function (step) {
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
  return new Promise((resolve, reject) => {
    googleMapsClient.directions({
      origin: origen,
      destination: destino
    }, (err, respuesta) => {
      if (err) {
        reject(new Error('Ha ocurrido un error en gogle maps: ' + err))
      } else if (respuesta.status !== 200 || respuesta.json.status !== 'OK') {
        reject(new Error('La solicitud de direccion no ha tenido resultados viables'))
      } else {
        resolve(respuesta)
      }
    })
  })
}
