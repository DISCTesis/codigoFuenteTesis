'use strict'
const AWS = require('aws-sdk')
const javascriptLpSolver = require('javascript-lp-solver')
const dynamodb = new AWS.DynamoDB.DocumentClient()
module.exports.generar = function (event, context, callback) {
  const bodegasSeleccionadasId = seleccionarBodegas(event.distancias, event.pedido,
    event.bodegas, event.operario.correo)
  if (bodegasSeleccionadasId instanceof Error) {
    callback(bodegasSeleccionadasId)
  } else {
    const solicitudes = generarSolicitudesAbastecimiento(bodegasSeleccionadasId, event.pedido, event.bodegas)
    publicarSolicitudes(solicitudes, event.operario._id, event.pedido)
      .then(res => {
        callback(null, {
          destino: event.operario.correo,
          asunto: 'Solicitud de abastecimiento completa, codigo pedido: ' + event.pedido._id,
          contenido: 'Se han seleccionado las siguientes bodegas: ' + JSON.stringify(res)
        })
      })
      .catch(err => {
        console.log(err)
        callback(crearError(event.operario.correo,
          'Solicitud de abastecimiento cancelada, codigo pedido: ' + event.pedido._id,
          'Error al crear solicitudes de abastecimiento'))
      })
  }
}
function seleccionarBodegas (distanciasBodegas, pedido, inventariosBodegas, correoOperario) {
  const mapaInventarioBodegas = mapearContenidoBodegas(inventariosBodegas)
  const modelo = darModeloOptimizacion(distanciasBodegas, pedido.items, mapaInventarioBodegas)
  console.log('El modelo: ', JSON.stringify(modelo))
  const resultadoSolver = javascriptLpSolver.Solve(modelo)
  if (erroresEnOptimizacion(resultadoSolver)) {
    console.log(erroresEnOptimizacion(resultadoSolver))
    return crearError(correoOperario, 'Solicitud de abastecimiento cancelada, codigo pedido: ' + pedido._id,
      'Los resultados de la optimizacion no fueron congruentes')
  } else {
    const bodegasSeleccionadas = []
    for (const property in resultadoSolver) {
      if (resultadoSolver.hasOwnProperty(property) && resultadoSolver[property] === 1) {
        bodegasSeleccionadas.push(property)
      }
    }
    return bodegasSeleccionadas
  }
}
function erroresEnOptimizacion (optimizacion) {
  if (!optimizacion) {
    return new Error('Error desconocido al optimizar')
  } else if (optimizacion.feasible === 'false' || optimizacion.result <= 0) {
    return new Error('Los resultados de la optimizacion no fueron congruentes')
  }
}
function darModeloOptimizacion (distancias, itemsPedido, mapaInventarioBodegas) {
  const modelo = {'optimize': 'distancia', 'opType': 'min', 'constraints': {}, 'variables': {}, 'ints': {}}
  itemsPedido.forEach((item) => {
    modelo.constraints[item.productoId] = {'min': item.cantidad}
  })
  distancias.forEach(distanciaBodega => {
    modelo.constraints['B' + distanciaBodega._id] = {max: 1}
    const bodegaId = distanciaBodega._id
    const bodegaVar = mapaInventarioBodegas.get(bodegaId)
    bodegaVar['distancia'] = parseInt(distanciaBodega.distancia.replace(' km', '').replace(',', ''))
    bodegaVar['B' + distanciaBodega._id] = 1
    modelo.variables[bodegaId] = bodegaVar
    modelo.ints[bodegaId] = 1
  })
  return modelo
}
function generarSolicitudesAbastecimiento (bodegasId, pedido, inventarioBodegas) {
  const solicitudes = []
  const mapaInventarioBodegas = mapearContenidoBodegas(inventarioBodegas, 1)
  const mapaInventario = mapearContenidoBodegas(inventarioBodegas)
  const mapaProductosAbastecidos = new Map()
  bodegasId.forEach(bodegaId => {
    const solicitudBodega = {'bodegaId': bodegaId, 'pedidoId': pedido._id}
    solicitudBodega['solicitudesProductos'] = generarSolicitudProductos(mapaInventarioBodegas.get(bodegaId),
      pedido, mapaProductosAbastecidos, productoId => {
        const objInventario = mapaInventario.get(bodegaId)
        for (const property in objInventario) {
          if (objInventario.hasOwnProperty(property) && property === productoId) {
            return objInventario[property]
          }
        }
        return 0
      })
    solicitudes.push(solicitudBodega)
  })
  return solicitudes
}
function generarSolicitudProductos (productosExistentesId, pedido, mapaProductosAbastecidos, darCantidadDisp) {
  const solicitudesProductos = []
  productosExistentesId.forEach(productoId => {
    const productoPedido = pedido.items.find(item => { return item.productoId === productoId })
    if (productoPedido && (!mapaProductosAbastecidos.get(productoPedido.productoId) || mapaProductosAbastecidos.get(productoPedido.productoId) < productoPedido.cantidad)) {
      let cantidadAct = mapaProductosAbastecidos.get(productoPedido.productoId)
        ? mapaProductosAbastecidos.get(productoPedido.productoId) : darCantidadDisp(productoId)
      cantidadAct = productoPedido.cantidad > cantidadAct ? cantidadAct : productoPedido.cantidad
      const solicitud = {'productoId': productoId, 'cantidad': cantidadAct}
      mapaProductosAbastecidos.set(productoPedido.productoId, cantidadAct)
      solicitudesProductos.push(solicitud)
    }
  })
  return solicitudesProductos
}
function mapearContenidoBodegas (bodegas, esArreglo) {
  const mapBodegas = new Map()
  bodegas.forEach(function (bodegaContenido) {
    const idBodega = bodegaContenido.bodegaId
    let arreglo = esArreglo ? [] : {}
    if (mapBodegas.has(idBodega)) {
      arreglo = mapBodegas.get(idBodega)
    }
    esArreglo ? arreglo.push(bodegaContenido.productoId)
      : arreglo[bodegaContenido.productoId] = bodegaContenido.unidades
    mapBodegas.set(idBodega, arreglo)
  })
  return mapBodegas
}

function snapshot (actualizadosFail, actualizados, creadosFail, creados) {
  console.log('Snapshot estado: ')
  console.log('actualizadosFail ' + JSON.stringify(actualizadosFail))
  console.log('actualizados ' + JSON.stringify(actualizados))
  console.log('creadosFail ' + JSON.stringify(creadosFail))
  console.log('creados ' + JSON.stringify(creados))
}
function publicarSolicitudes (solicitudes, operarioId, pedido) {
  return new Promise((resolve, reject) => {
    const actualizados = []
    const actualizadosFail = []
    const creados = []
    const creadosFail = []
    actualizarInventarios(solicitudes, actualizados, actualizadosFail)
      .then(inventariosActualizados => {
        return buscarErrores(inventariosActualizados, actualizados, actualizadosFail, creados, creadosFail)
      })
      .then(() => {
        return crearSolicitudes(operarioId, pedido, solicitudes, creados, actualizadosFail)
      })
      .then(solicitudesCreadas => {
        return buscarErrores(solicitudesCreadas, actualizados, actualizadosFail, creados, creadosFail)
      })
      .then(() => {return actualizarPedido(pedido)})
      .then(() => {
        resolve({solicitudesCreadas: JSON.stringify(creados), inventariosActualizados: JSON.stringify(actualizados)})
      })
      .catch(err => { reject(err) })
  })
}
function actualizarPedido (pedido) {
  return dynamodb.update({
    TableName: 'SolicitudAbastecimiento',
    Key: {
      _id: pedido._id
    },
    UpdateExpression: 'set estadoActual = :nvoEstado',
    ExpressionAttributeValues: {':nvoEstado': 1},
    ReturnValues: 'UPDATED_NEW'
  })
    .promise()
}
function buscarErrores (transaccion, actualizados, actualizadosFail, creados, creadosFail) {
  return new Promise((resolve, reject) => {
    const err = transaccion.find(elemento => { return elemento instanceof Error })
    if (err) {
      console.log('Detalle del error: ' + err)
      snapshot(actualizadosFail, actualizados, creadosFail, creados)
      rollback(actualizados, creados)
        .then(() => {
          console.log('Transaccion reversadas con exito')
          reject(new Error('Error al persistir informacion, intentelo de nuevo'))
        })
        .catch(erroRollback => {
          console.log('Transaccion no reversada, base de datos en estado inconsistente. ' +
            'Error: ' + erroRollback)
          reject(new Error('Error critico al persistir informacion'))
        })
    } else {
      resolve('OK')
    }
  })
}
function crearSolicitudes (operarioId, pedido, solicitudes, creados, creadosFail) {
  const solicitudesCreadas = []
  solicitudes.forEach(solicitud => {
    solicitudesCreadas.push(crearSolicitud(darParametrosCrearSolicitud(operarioId, solicitud.bodegaId,
      pedido._id, solicitud.solicitudesProductos), creados, creadosFail))
  })
  return Promise.all(solicitudesCreadas)
}
function actualizarInventarios (solicitudes, actualizados, actualizadosFail) {
  const actualizaciones = []
  solicitudes.forEach(solicitud => {
    solicitud.solicitudesProductos.forEach(inventario => {
      actualizaciones.push(actualizarInventario(inventario, solicitud.bodegaId,
        actualizados, actualizadosFail))
    })
  })
  return Promise.all(actualizaciones)
}
function crearSolicitud (parametros, creados, fails) {
  return new Promise(resolve => {
    const solicitudId = {
      bodegaId: parametros.Item.bodegaId,
      pedidoId: parametros.Item.pedidoId
    }
    dynamodb.put(parametros).promise()
      .then(() => {
        creados.push(solicitudId)
        resolve(solicitudId)
      })
      .catch(err => {
        fails.push(solicitudId)
        console.log('Parametros del error crear solicitud: ' + JSON.stringify(parametros))
        resolve(new Error('Error al crear solicitud: ' + err))
      })
  })
}
function actualizarInventario (inventario, idBodega, actualizados, fails) {
  return new Promise(resolve => {
    dynamodb.update(darParametrosActualizacionInventario(inventario, idBodega))
      .promise()
      .then(data => {
        actualizados.push({bodegaId: idBodega, productoId: inventario.productoId, cantidad: inventario.cantidad})
        resolve(data)
      })
      .catch(err => {
        console.log('Parametros del error actualizar inventario: ' +
          JSON.stringify(darParametrosActualizacionInventario(inventario, idBodega)))
        fails.push({bodegaId: idBodega, productoId: inventario.productoId, cantidad: inventario.cantidad})
        resolve(new Error('Error al actualizar inventario: ' + err))
      })
  })
}
function rollback (actualizados, creados) {
  const resultados = []
  actualizados.forEach(inventarioAct => {
    resultados.push(dynamodb.update({
      TableName: 'Inventario',
      Key: {
        'productoId': inventarioAct.productoId,
        'bodegaId': inventarioAct.bodegaId
      },
      UpdateExpression: 'set unidades=unidades+:cantidad',
      ExpressionAttributeValues: {':cantidad': inventarioAct.cantidad},
      ReturnValues: 'UPDATED_NEW'
    })
      .promise())
  })
  creados.forEach(idSolicitudCreada => {
    resultados.push(dynamodb.delete({
      TableName: 'SolicitudAbastecimiento',
      Key: {'bodegaId': idSolicitudCreada.bodegaId, 'pedidoId': idSolicitudCreada.pedidoId}
    }).promise())
  })
  return Promise.all(resultados)
}
function darParametrosActualizacionInventario (inventario, idBodega) {
  return {
    TableName: 'Inventario',
    Key: {
      'productoId': inventario.productoId,
      'bodegaId': idBodega
    },
    UpdateExpression: 'set unidades=unidades-:unidadesSolicitadas',
    ConditionExpression: 'unidades>=:unidadesSolicitadas',
    ExpressionAttributeValues: {
      ':unidadesSolicitadas': inventario.cantidad
    },
    ReturnValues: 'UPDATED_NEW'
  }
}
function darParametrosCrearSolicitud (operarioId, bodegaId, pedidoId, productos) {
  return {
    TableName: 'SolicitudAbastecimiento',
    Item: {
      'operarioId': operarioId,
      'fechaSolicitud': (new Date()).toJSON(),
      'bodegaId': bodegaId,
      'pedidoId': pedidoId,
      'productosSolicitados': productos
    }
  }
}
function crearError (destino, asunto, contenido) {
  return new Error(JSON.stringify({
    destino: destino,
    asunto: asunto,
    contenido: contenido
  }))
}
