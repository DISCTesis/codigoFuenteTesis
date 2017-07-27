'use strict'
const AWS = require('aws-sdk')
const dynamoDb = new AWS.DynamoDB.DocumentClient()
const googleMapsClient = require('@google/maps').createClient({
  key: 'AIzaSyDogDzCNpGOaS-8GOyqznisBloTt5VwQTs'
})
module.exports.darDistancias = function (event, context, callback) {
  Promise.all(obtenerBodegas(event.bodegas)).then(function (data) {
    const idBodegas = []
    const destinos = cargarDestinos(data, idBodegas)
    const ubicacionGeografica = event.pedido.ubicacionGeografica
    calcularDistancia(ubicacionGeografica.latitud.toString() + ',' + ubicacionGeografica.longitud,
      destinos, idBodegas, function (err, distancias) {
        if (err) {
          console.log('Error en google maps: ' + err)
          callback(crearError(event.operario.correo,
            'Solicitud de abastecimiento cancelada, codigo pedido: ' + event.pedido._id,
            'Error al solicitar ubicacion de bodega'))
        } else {
          callback(null, {
            distancias: distancias,
            bodegas: event.bodegas,
            pedido: event.pedido,
            operario: event.operario
          })
        }
      })
  }).catch(function (err) {
    console.log('Error en la bd al ejecutar query: ' + err)
    callback(crearError(event.operario.correo,
      'Solicitud de abastecimiento cancelada, codigo pedido: ' + event.pedido._id,
      'Error desconcido en procesamiento'))
  })
}
function cargarDestinos (bodegas, arrayId) {
  let destinos = ''
  bodegas.forEach(function (resultBodega) {
    const ubicacion = resultBodega.Items[0].ubicacionGeografica
    destinos += ubicacion.latitud.toString() + ',' + ubicacion.longitud.toString() + '|'
    arrayId.push(resultBodega.Items[0]._id)
  })
  return destinos
}
function calcularDistancia (origen, destinos, ids, cb) {
  googleMapsClient.distanceMatrix({
    origins: origen,
    destinations: destinos
  }, function (err, res) {
    if (err) {
      cb(err)
    }
    const distancias = []
    res.json.rows.forEach(function (fila) {
      fila.elements.forEach(function (elemento, index) {
        distancias.push({
          '_id': ids[index],
          'distancia': elemento.distance.text
        })
      })
    })
    cb(null, distancias)
  })
}
function obtenerBodegas (bodegas) {
  const mapBodegas = new Map()
  const querys = []
  bodegas.forEach(function (bodega) {
    mapBodegas.set(bodega.bodegaId, 'bodegaId')
  })
  mapBodegas.forEach(function (val, key) {
    querys.push(dynamoDb.query({
      TableName: 'Bodega', KeyConditionExpression: '#bi= :bi', ExpressionAttributeNames: {'#bi': '_id'},
      ExpressionAttributeValues: {':bi': key}, ProjectionExpression: 'ubicacionGeografica, #bi'
    }).promise())
  })
  return querys
}
function crearError (destino, asunto, contenido) {
  return new Error(JSON.stringify({
    destino: destino,
    asunto: asunto,
    contenido: contenido
  }))
}