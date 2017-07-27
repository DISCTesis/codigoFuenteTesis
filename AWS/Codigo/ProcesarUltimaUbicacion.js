'use strict'
const aws = require('aws-sdk')
const dynamoDb = new aws.DynamoDB.DocumentClient()
const uuid = require('uuid')
module.exports.ultimaUbicacion = function (event, context, callback) {
  console.log('Received event:', JSON.stringify(event, null, 2))
  event.Records.forEach((record) => {
    if (record.eventName === 'MODIFY') {
      procesarRuta(record)
    }
  })
  console.log(`Successfully processed ${event.Records.length} records.`)
  callback(null, `Successfully processed ${event.Records.length} records.`)
}
function procesarRuta (record) {
  const img = record.dynamodb.OldImage
  if (img.bodegaId && img.latitud && img.longitud && img.fecha) {
    dynamoDb.put({
      TableName: 'ubicacionRecorrida',
      Item: {
        'id': uuid.v1(),
        'pedidoId': record.dynamodb.Keys.pedidoId.S,
        'conductorId': record.dynamodb.Keys.conductorId.S,
        'bodegaId': img.bodegaId[0],
        'latitud': img.latitud[0],
        'longitud': img.longitud[0],
        'fecha': img.fecha[0]
      }
    }, (err) => {
      if (err) {
        console.log('Ha ocurrido un error al registrar ubicacion recorrida: ' + err)
      }
    })
  } else {
    console.error('No tiene estructura, se recibió: ' + JSON.stringify(img))
  }
}
