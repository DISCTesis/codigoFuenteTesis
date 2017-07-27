'use strict'
const azure = require('azure-storage')
const tableService = azure.createTableService('') // TODO entre las comillas simples pegar la cadena de conexion con TableStorage
module.exports.postularBodegas = function (context, req) {
 const pedidoSolicitado = req.body.pedido
  if (!pedidoSolicitado || !pedidoSolicitado.items || !req.body.operario) {
    responder(context, 'Solicitud no tiene estructura valida, debe tener un pedido & operario')
  } else {
    Promise.all(buscarBodegas(pedidoSolicitado.items))
      .then(resultados => {
        if (resultados.length === 0) {
          responder(context, 'No se encontraron bodegas que puedan satisfacer el pedido')
        } else {
          const inventarioBodegas = resultados.reduce((inventarios, invAct) => { return inventarios.concat(invAct) })
          context.log('Resultado: ', JSON.stringify(inventarioBodegas))
          context.bindings.queue = {
            bodegas: inventarioBodegas,
            pedido: pedidoSolicitado,
            operario: req.body.operario
          }
          responder(context, 'Se esta procesando el pedido, se le notificará con un email cuando termine')
        }
      })
      .catch(err => context.done(err))
  }
}

function buscarBodegas (productosBuscados) {
  let resultados = []
  productosBuscados.forEach(function (item) {
    resultados.push(ejecutarQuery(item.productoId, item.cantidad))
  })
  return resultados
}
function ejecutarQuery (pk, unidades) {
  return new Promise((resolve, reject) => {
    const query = new azure.TableQuery()
      .where('PartitionKey eq ? and unidades ge ?', pk, unidades)
    tableService.queryEntities('Inventario', query, null, function (error, result, response) {
      if (error) {
        reject(new Error('Error en BD query inventarios: ' + error))
      } else {
        const inventariosBodega = []
        result.entries.forEach(entrada => {
          inventariosBodega.push({
            PartitionKey: entrada.PartitionKey._,
            RowKey: entrada.RowKey._,
            unidades: entrada.unidades._
          })
        })
        resolve(inventariosBodega)
      }
    })
  })
}
function responder (context, msg, status) {
  let respuesta = {body: msg}
  if (status) {
    respuesta['status'] = status
  }
  context.done(null, respuesta)
}
