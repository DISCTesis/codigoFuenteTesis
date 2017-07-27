const Cloudant = require('cloudant')
const me = '' // TODO username en las credenciales de servicio en CloudantDB
const password = '' // TODO password en las credenciales de servicio en CloudantDB
const cloudant = Cloudant({account: me, password: password, plugin: 'promises'})
const db = cloudant.db.use('ccp')
function main(params) {
const pedidoSolicitado = params.pedido
  if (pedidoSolicitado && pedidoSolicitado.items && params.operario) {
    return postularBodegas(pedidoSolicitado, params.operario)
  }
  else {
    console.log('Se recibió: '+JSON.stringify(params))
    return {'message': 'Solicitud no tiene estructura valida, debe tener un pedido & operario'}
  }
}
function postularBodegas (pedido, operario) {
  return Promise.all(obtenerInventarios(pedido.items))
    .then(resultados => {
      let respuesta = []
      resultados.forEach(resultado => respuesta = respuesta.concat(resultado))
      if (respuesta.length === 0) {
        return (new Error('No se encontraron bodegas que puedan satisfacer el pedido'))
      } else {
        return ({topic:"ubicaciones", value:JSON.stringify({operario: operario, pedido: pedido, bodegas: respuesta})})
      }
    })
    .catch(err => {return err})
}
function obtenerInventarios (itemsInventario) {
  const querys = []
  itemsInventario.forEach(item => {
    querys.push(db.find({
        selector: {
          'type': 'Inventario',
          'productoId': item.productoId,
          'unidades': {'$gte': item.cantidad}
        }
      })
        .then(resultado => {return resultado.docs})
        .catch(err => {
          throw new Error('Error al consultar inventarios: ' + JSON.stringify(err))
        })
    )
  })
  return querys
}