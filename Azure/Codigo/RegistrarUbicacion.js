const uuid = require('uuid')
const azure = require('azure-storage')
const tableService = azure.createTableService('') // TODO pegar la clave de acceso a la cuenta de almacenamiento entre las comillas
const tablaUbicacion = 'UltimaUbicacion'
module.exports = function (context, req) {
  const data = req.body
  const params = darUltimaUbicacionParams(req.params.pedidoId, req.params.conductorId, req.params.bodegaId,
    data.latitud, data.longitud, data.fecha)
  darEntidad(tablaUbicacion, params.PartitionKey, params.RowKey)
    .then(ubicacion => {
      if (ubicacion) {
        return upsertEntidad('UbicacionRecorrida', darUbicacionRecorridaParams(uuid(), ubicacion.PartitionKey._,
          ubicacion.RowKey._, ubicacion.bodegaId._, ubicacion.latitud._, ubicacion.longitud._, ubicacion.fecha._))
      }
      return
    })
    .then(() => { return upsertEntidad(tablaUbicacion, params) })
    .then(res => context.done(null, {body: res}))
    .catch(err => {
      context.log.error('Error: ' + err)
      context.done(null, {status: 400, body: 'Error al validar campos: ' + err})
    })
}
function darEntidad (nombreTabla, pk, rk) {
  return new Promise((resolve, reject) => {
    tableService.retrieveEntity(nombreTabla, pk, rk, (err, result) => {
      if (err) {
        if (err.code === 'ResourceNotFound') {
          resolve()
        } else {
          reject('Ha ocurrido un error, por favor intentelo más tarde: ' + err)
        }
      } else {
        resolve(result)
      }
    })
  })
}
function upsertEntidad (nombreTabla, entidad) {
  return new Promise((resolve, reject) => {
    tableService.insertOrReplaceEntity(nombreTabla, entidad, (err, result) => {
      if (err) {
        reject('Ha ocurrido un error, por favor intentelo más tarde' + err)
      } else {
        resolve('Se ha actualizado: ' + result)
      }
    })
  })
}
function darUltimaUbicacionParams (pedidoId, conductorId, bodegaId, latitud, longitud, fecha) {
  return {
    'PartitionKey': pedidoId,
    'bodegaId': bodegaId,
    'RowKey': conductorId,
    'latitud': latitud,
    'longitud': longitud,
    'fecha': fecha
  }
}
function darUbicacionRecorridaParams (pk, pedidoId, conductorId, bodegaId, latitud, longitud, fecha) {
  return {
    'PartitionKey': pk,
    'RowKey': pedidoId,
    'bodegaId': bodegaId,
    'conductorId': conductorId,
    'latitud': latitud,
    'longitud': longitud,
    'fecha': fecha
  }
}