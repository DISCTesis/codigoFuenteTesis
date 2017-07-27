'use strict'
const Cloudant = require('cloudant')
const me = '' // TODO username en las credenciales de servicio en CloudantDB
const password = '' // TODO password en las credenciales de servicio en CloudantDB
const cloudant = Cloudant({account: me, password: password, plugin: 'retry'})
const db = cloudant.db.use('ccp')
const sendgrid = require('sendgrid')('') // TODO pegar la llave de los servicios de sendgrid entre las comillas simples
const googleMapsClient = require('@google/maps').createClient({
  key: ''	// TODO pegar la llave de servicios de Google Mpas entre las comillas simples
})

function main (params) {
  if (params.bodegaId && params.pedidoId && params.conductorId && params.fechaDeEntrega
    && params.fechaDeSalida) {
    return procesarEnvio(params)
      .then(() => {return darEntidad('Empleado', params.conductorId)})
      .then((nConductor) => {
        return enviarCorreo(nConductor.correo,
          'Asignacion de envio para pedido id: ' + params.pedidoId,
          'Se le ha asignado un envio, fecha de salida: ' + params.fechaDeSalida + '' +
          ' partiendo de la bodegaid: ' + params.bodegaId)
      })
      .then(() => {return {msg: 'Se ha creado el envio correctamente '}})
      .catch(err => {
        console.error('Ha ocurrido un error al crear envio: ' + err)
        throw new Error('Ha ocurrido un error al crear envio: ' + err)
      })
  } else {
    console.log('Error, parametros incompletos: ', JSON.stringify(params))
    throw new Error('No se encontraron los parametros de ruta necesarios')
  }
}
function procesarEnvio (data) {
  let ubicacionBodega
  return darEntidad('Bodega', data.bodegaId)
    .then(nBodega => {
      ubicacionBodega = nBodega.ubicacionGeografica
      return darEntidad('Pedido', data.pedidoId)
    })
    .then(nPedido => {
      return procesarRuta(ubicacionBodega, nPedido.ubicacionGeografica)
    })
    .then(nDirecciones => {
      const distancia = nDirecciones.json.routes[0].legs[0].distance.text
      const duracion = nDirecciones.json.routes[0].legs[0].duration.text
      const direcciones = darFormatoDirecciones(nDirecciones.json.routes[0].legs[0].steps)
      const parametros = darParametrosCrearEnvio(data.pedidoId, data.bodegaId, data,
        direcciones, distancia, duracion)
      return insertarDato(parametros)
    })
}
function darParametrosCrearEnvio (pedidoId, bodegaId, data, direcciones, distancia, duracion) {
  return {
    'pedidoId': pedidoId,
    'bodegaId': bodegaId,
    'conductorId': data.conductorId,
    'fechaDeEntrega': data.fechaDeEntrega,
    'fechaDeSalida': data.fechaDeSalida,
    'ruta': direcciones,
    'distancia': distancia,
    'duracion': duracion,
    'type': 'Envio'
  }
}
function procesarRuta (bodegaUbicacion, pedidoUbicacion) {
  const destino = bodegaUbicacion.latitud.toString() + ',' +
    bodegaUbicacion.longitud.toString()
  const origen = pedidoUbicacion.latitud.toString() + ',' +
    pedidoUbicacion.longitud.toString()
  return darDirecciones(origen, destino)
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
  return new Promise((res, rej) => {
    googleMapsClient.directions({
      origin: origen,
      destination: destino
    }, (err, respuesta) => {
      if (err) {
        rej(new Error('Ha ocurrido un error en gogle maps: ' + err))
      } else if (respuesta.status !== 200 || respuesta.json.status !== 'OK') {
        rej(new Error('La solicitud de direccion no ha tenido resultados viables'))
      } else {
        res(respuesta)
      }
    })
  })
}
function darEntidad (nombreEntidad, id) {
  return new Promise((resolve, reject) => {
    db.find({selector: {type: nombreEntidad, _id: id}}, (err, data) => {
      err ? reject(new Error('Error al buscarbodegas en BD: ', err)) : resolve(data.docs[0])
    })
  })
}
function insertarDato (nDoc) {
  return new Promise((resolve, reject) => {
    db.insert(nDoc, null, (err, body) =>
      err ? reject(new Error('Error al persistir en BD: ' + err)) : resolve(body))
  })
}
function enviarCorreo (nEmail, sbject, msg) {
  const helper = require('sendgrid').mail
  const from = new helper.Email('') // TODO correo de envios
  const to = new helper.Email(nEmail)
  const content = new helper.Content('text/plain', msg)
  const mail = new helper.Mail(from, sbject, to, content)
  const req = sendgrid.emptyRequest({
    method: 'POST',
    path: '/v3/mail/send',
    body: mail.toJSON()
  })
  return sendgrid.API(req)
}
exports.main = main