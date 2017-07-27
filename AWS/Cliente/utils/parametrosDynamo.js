const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB.DocumentClient()

module.exports.insertar = (nombreTabla, itemsJson) => {
  const proceso = dynamodb.put({
    TableName: nombreTabla,
    Item: itemsJson
  })
  return promesaRespuesta(proceso)
}

module.exports.query = (nombreTabla, condicionLlave, ObjValorAtributos) => {
  const params = {
    TableName: nombreTabla,
    KeyConditionExpression: condicionLlave,
    ExpressionAttributeValues: ObjValorAtributos
  }
  return promesaRespuesta(dynamodb.query(params), res => {
    return res.Items
  })
}

module.exports.scan = (nombreTabla, filtro, ObjValorAtributos) => {
  let params = {
    TableName: nombreTabla
  }
  if (filtro !== null || filtro !== undefined) {
    params['FilterExpression'] = filtro
    params['ExpressionAttributeValues'] = ObjValorAtributos
  }
  return promesaRespuesta(dynamodb.scan(params), res => {
    return res.Items
  })
}

module.exports.get = (nombreTabla, objLlaves) => {
  const parametros = {
    TableName: nombreTabla,
    Key: objLlaves
  }
  return promesaRespuesta(dynamodb.get(parametros), res => {
    return res.Item
  })
}

module.exports.delete = (nombreTabla, objLlaves) => {
  const parametros = {
    TableName: nombreTabla,
    Key: objLlaves
  }
  return promesaRespuesta(dynamodb.delete(parametros), res => {
    return res.Item
  })
}

module.exports.update = (nombreTabla, objLlaves, actualizacion, ObjValorAtributos) => {
  const parametros = {
    TableName: nombreTabla,
    Key: objLlaves,
    UpdateExpression: actualizacion,
    ExpressionAttributeValues: ObjValorAtributos,
    ReturnValues: 'UPDATED_NEW'
  }
  return promesaRespuesta(dynamodb.update(parametros))
}

function promesaRespuesta (nPromesa, cb) {
  return new Promise((resolve, reject) => {
    nPromesa
      .promise()
      .then(data => resolve(cb ? cb(data) : data))
      .catch(err => reject(err))
  })
}

