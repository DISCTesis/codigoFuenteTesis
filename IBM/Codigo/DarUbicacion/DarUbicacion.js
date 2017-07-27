const Cloudant = require('cloudant')
const me = '' // TODO username en las credenciales de servicio en CloudantDB
const password = '' // TODO password en las credenciales de servicio en CloudantDB
const cloudant = Cloudant({account: me, password: password, plugin: 'retry'})
const db = cloudant.db.use('ccp')
const googleMapsClient = require('@google/maps').createClient({
  key: '' // TODO pegar la llave de servicios de Google Mpas entre las comillas simples
})
const sendgrid = require('sendgrid')('') // TODO pegar la llave de los servicios de sendgrid entre las comillas simples

function distancias (params) {
  params=params.messages[0].value
  console.log('Los parametros son: '+JSON.stringify(params))
  return Promise.all(obtenerBodegas(params.bodegas))
    .then(function (data) {
      const idBodegas = []
      const destinos = cargarDestinos(data, idBodegas)
      const ubicacionGeografica = params.pedido.ubicacionGeografica
      return calcularDistancia(ubicacionGeografica.latitud.toString() + ',' + ubicacionGeografica.longitud,
        destinos, idBodegas)
    })
    .then(distancias => {
      return {
        distancias: distancias,
        bodegas: params.bodegas,
        pedido: params.pedido,
        operario: params.operario
      }
    })
    .catch(function (err) {
      enviarCorreo(params.operario._id,
        'Procesamiento cancelado, pedido id: ' + params.pedido._id,
        'Se ha cancelado el procesameinto debido a un error en BD: ' + err)
      console.log('Error en la bd al ejecutar query: ' + err)
      return new Error('Error en la bd al ejecutar query: ' + err)
    })
}
function cargarDestinos (bodegas, arrayId) {
  let destinos = ''
  bodegas.forEach(function (resultBodega) {
    const ubicacion = resultBodega.ubicacionGeografica
    destinos += ubicacion.latitud.toString() + ',' + ubicacion.longitud.toString() + '|'
    arrayId.push(resultBodega._id)
  })
  return destinos
}
function calcularDistancia (origen, destinos, ids) {
  return new Promise((resolve, reject) => {
    googleMapsClient.distanceMatrix({origins: origen, destinations: destinos},
      function (err, res) {
        if (err) {
          reject(new Error('Error en Google maps: ' + err))
        }
        const distancias = []
        res.json.rows.forEach(function (fila) {
          fila.elements.forEach(function (elemento, index) {
            distancias.push({'_id': ids[index], 'distancia': elemento.distance.text})
          })
        })
        resolve(distancias)
      })
  })
}
function obtenerBodegas (ineventarios) {
  const mapBodegas = new Map()
  const querys = []
  ineventarios.forEach(function (inventario) {
    mapBodegas.set(inventario.bodegaId, 'bodegaId')
  })
  mapBodegas.forEach(function (_, key) {
    const busqueda = ejecutarBusquedaBodega(key)
    querys.push(busqueda)
  })
  return querys
}

function ejecutarBusquedaBodega (key) {
  return new Promise((resolve, reject) => {
    db.find({
      selector: {'_id': key}
    }, (err, result) => {
      if (err) {
        reject(new Error('Error al consultar bodegas: ' + JSON.stringify(err)))
      } else {
        resolve(result.docs[0])
      }
    })
  })
}
function enviarCorreo (nEmail, sbject, msg) {
  const helper = require('sendgrid').mail
  const from = new helper.Email('') // TODO cuenta de correo para el envío de correos
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
exports.main = distancias