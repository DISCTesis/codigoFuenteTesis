'use strict'
const AWS = require('aws-sdk')
const dynamoDb = new AWS.DynamoDB.DocumentClient()
module.exports.postularBodegas = function (event, context, callback) {
  const pedidoSolicitado = event.pedido
  Promise.all(buscarBodegas(pedidoSolicitado.items)).then(function (resultados) {
    let respuesta = []
    resultados.forEach(function (resultado) {
      respuesta = respuesta.concat(resultado)
    })
    if (respuesta && respuesta.length > 0) {
      callback(null, {
        operario: event.operario,
        pedido: pedidoSolicitado,
        bodegas: respuesta
      })
    } else {
      callback(crearError(event.operario.correo,
        'Solicitud de abastecimiento cancelada, codigo pedido: ' + pedidoSolicitado._id,
        'No se encontraron bodegas que puedan satisfacer el pedido'))
    }
  }).catch(function (err) {
    console.log(err)
    callback(crearError(event.operario.correo,
      'Solicitud de abastecimiento cancelada, codigo pedido: ' + pedidoSolicitado._id,
      'Error desconcido en procesamiento'))
  })
}
function buscarBodegas (productosBuscados) {
  const querys = []
  productosBuscados.forEach(function (item) {
    querys.push(ejecutarQuery({
      TableName: 'Inventario',
      KeyConditionExpression: 'productoId = :producto',
      FilterExpression: 'unidades>= :cantidad',
      ExpressionAttributeValues: {
        ':producto': item.productoId,
        ':cantidad': item.cantidad
      }
    }))
  })
  return querys
}
function ejecutarQuery (params) {
  return new Promise(function (res, rej) {
    dynamoDb.query(params).promise().then(function (data) {
      const respuesta = []
      data.Items.forEach(function (item) {
        respuesta.push(item)
      })
      res(respuesta)
    }).catch(function (err) {
      rej(new Error('Error en la bd al ejecutar query: ' + err))
    })
  })
}
function crearError (destino, asunto, contenido) {
  return new Error(JSON.stringify({
    destino: destino,
    asunto: asunto,
    contenido: contenido
  }))
}