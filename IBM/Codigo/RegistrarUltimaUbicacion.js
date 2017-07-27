const Cloudant = require('cloudant')
const me = '' // TODO username en las credenciales de servicio en CloudantDB
const password = '' // TODO password en las credenciales de servicio en CloudantDB
const cloudant = Cloudant({account: me, password: password, plugin: 'retry'})
const db = cloudant.db.use('ccp')

function main (params) {
  return darEntidad('UltimaUbicacion', params.id)
    .then(data => {
      if (data) {
        delete data._id
        data.type = 'UbicacionRecorrida'
        return insertarDato(data)
      } else {
        return {'msg': 'Caso Omiso'}
      }
    })
    .then(insertado => {return insertado})
    .catch(err => {return new Error('Error en bd: ' + err)})
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