'use strict'
const javascriptLpSolver = require('javascript-lp-solver')
const azure = require('azure-storage')
const tableService = azure.createTableService('') // TODO pegar la clave de acceso a la cuenta de almacenamiento entre las comillas

const solicitudCanceladaMsg = 'Solicitud de abastecimiento cancelada, codigo pedido: '
const unboundLpSolverMsg = 'Los resultados de la optimizacion no fueron congruentes'
const solicitudCompletaMsg = 'Solicitud de abastecimiento completa, codigo pedido: '
const bodegasSeleccionadasMsg = 'Se han seleccionado las siguientes bodegas: '
const errDesconocidoMsg = 'Error Desconocido'

module.exports.generar = function (context, colaMsg, inventariosBD) {
  context.log(JSON.stringify(colaMsg))
  context.log(JSON.stringify(inventariosBD))
  const bodegasSeleccionadasId = seleccionarBodegas(colaMsg.distancias, colaMsg.pedido, colaMsg.bodegas)
  if (bodegasSeleccionadasId instanceof Error) {
    context.log.error(erroresEnOptimizacion(bodegasSeleccionadasId))
    context.bindings.email = armarCorreo(colaMsg.operario.correo,
      solicitudCanceladaMsg + colaMsg.pedido.PartitionKey,
      unboundLpSolverMsg)
    context.done(new Error(unboundLpSolverMsg))
  } else {
    try {
      const solicitudesAbastecimiento = generarSolicitudesAbastecimiento(bodegasSeleccionadasId, colaMsg.pedido,
        colaMsg.bodegas, colaMsg.operario.PartitionKey)
      const inventariosModificar = darInventariosModificadosPorSolicitudes(solicitudesAbastecimiento,
        mapearInventario(inventariosBD))
      context.log(JSON.stringify(inventariosModificar))
      context.bindings.tableStorageSolicitudes = solicitudesAbastecimiento
      context.bindings.email = armarCorreo(colaMsg.operario.correo, solicitudCompletaMsg + colaMsg.pedido.PartitionKey,
        bodegasSeleccionadasMsg + JSON.stringify(solicitudesAbastecimiento))
      actualizar({nombreTabla: 'Inventario', items: inventariosModificar})
        .then(responses => {
          const errores = []
          responses.forEach(response => response instanceof Error ? errores.push(response) : context.log('OK'))
          errores.length > 0 ? context.done('Errores: ' + JSON.stringify(errores)) : context.done()
        })
        .catch(err => context.done('Ocurrió un error desconocido: '+err))
    } catch (err) {
      context.log.error(errDesconocidoMsg + ' ' + err)
      context.bindings.email = armarCorreo(colaMsg.operario.correo, solicitudCanceladaMsg + colaMsg.pedido.PartitionKey,
        errDesconocidoMsg)
      context.done(err)
    }
  }
}
function generarSolicitudesAbastecimiento (bodegasId, pedido, inventarioBodegas, operarioId) {
  const mapaInventarioBodegas = mapearContenidoBodegas(inventarioBodegas, 1)
  const mapaInventario = mapearContenidoBodegas(inventarioBodegas)
  const mapaProductosAbastecidos = new Map()
  const solicitudes = []
  bodegasId.forEach(bodegaId => {
    const solicitudAbastecimiento = {'PartitionKey': bodegaId, 'RowKey': pedido.PartitionKey, 'operarioId': operarioId}
    solicitudAbastecimiento['solicitudesProductos'] = generarSolicitudProductos(mapaInventarioBodegas.get(bodegaId),
      pedido, mapaProductosAbastecidos, darCantidadDispoible(mapaInventario, bodegaId))
    solicitudes.push(solicitudAbastecimiento)
  })
  return solicitudes
}
function darInventariosModificadosPorSolicitudes (solicitudesAbastecimiento, mapaInventariosActuales) {
  let invActualizar = []
  solicitudesAbastecimiento.forEach(solicitudAbastecimiento => {
    invActualizar = invActualizar.concat(darInventariosModificar(solicitudAbastecimiento.PartitionKey,
      solicitudAbastecimiento.solicitudesProductos, mapaInventariosActuales))
  })
  return invActualizar
}
function darCantidadDispoible (mapaInventario, bodegaId) {
  return productoId => {
    const objInventario = mapaInventario.get(bodegaId)
    for (const property in objInventario) {
      if (objInventario.hasOwnProperty(property) && property === productoId) {
        return objInventario[property]
      }
    }
    return 0
  }
}
function generarSolicitudProductos (productosExistentesId, pedido, mapaProductosAbastecidos, darCantidadDisp) {
  const solicitudesProductos = []
  productosExistentesId.forEach(productoId => {
    const productoPedido = pedido.items.find(item => { return item.productoId === productoId })
    if (productoPedido && (!mapaProductosAbastecidos.get(productoPedido.productoId) ||
      mapaProductosAbastecidos.get(productoPedido.productoId) < productoPedido.cantidad)) {
      let cantidadAct = mapaProductosAbastecidos.get(productoPedido.productoId)
        ? mapaProductosAbastecidos.get(productoPedido.productoId) : darCantidadDisp(productoId)
      cantidadAct = productoPedido.cantidad > cantidadAct ? cantidadAct : productoPedido.cantidad
      const solicitudProducto = {
        'productoId': productoId,
        'cantidad': cantidadAct
      }
      mapaProductosAbastecidos.set(productoPedido.productoId, cantidadAct)
      solicitudesProductos.push(solicitudProducto)
    }
  })
  return solicitudesProductos
}
function darInventariosModificar (bodegaId, solicitudProductos, mapaInventariosBD) {
  const inventariosActualizar = []
  solicitudProductos.forEach(solicitudProducto => {
    const invId = JSON.stringify({RowKey: bodegaId, PartitionKey: solicitudProducto.productoId})
    const cantidadInvAct = mapaInventariosBD.get(invId)
    if (cantidadInvAct && cantidadInvAct >= solicitudProducto.cantidad) {
      const unidadesResultantes = cantidadInvAct - solicitudProducto.cantidad
      //  inventario modificado
      const inventario = JSON.parse(invId)
      inventario['unidades'] = unidadesResultantes
      inventariosActualizar.push(inventario)
      //  actualizar inventario del mapa
      mapaInventariosBD.set(invId, unidadesResultantes)
    } else {
      throw new Error('Inventario incompatible')
    }
  })
  return inventariosActualizar
}
function seleccionarBodegas (distanciasBodegas, pedido, inventariosBodegas) {
  const mapaInventarioBodegas = mapearContenidoBodegas(inventariosBodegas)
  const modelo = darModeloOptimizacion(distanciasBodegas, pedido.items, mapaInventarioBodegas)
  console.log('El modelo: ', JSON.stringify(modelo))
  const resultadoSolver = javascriptLpSolver.Solve(modelo)
  const errores = erroresEnOptimizacion(resultadoSolver)
  if (errores) { return errores } else {
    const bodegasSeleccionadas = []
    for (const property in resultadoSolver) {
      if (resultadoSolver.hasOwnProperty(property) && resultadoSolver[property] === 1) {
        bodegasSeleccionadas.push(property)
      }
    }
    return bodegasSeleccionadas
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
    if (bodegaVar) {
      bodegaVar['distancia'] = parseInt(distanciaBodega.distancia.replace(' km', '').replace(',', ''))
      bodegaVar['B' + distanciaBodega._id] = 1
      modelo.variables[bodegaId] = bodegaVar
      modelo.ints[bodegaId] = 1
    }
  })
  return modelo
}
function mapearInventario (inventario) {
  const map = new Map()
  inventario.forEach(item => map.set(JSON.stringify({
    RowKey: item.RowKey,
    PartitionKey: item.PartitionKey
  }), item.unidades))
  return map
}
function erroresEnOptimizacion (optimizacion) {
  if (!optimizacion) {
    return new Error('Error desconocido al optimizar')
  } else if (optimizacion.feasible === 'false' || optimizacion.result <= 0) {
    return new Error('Los resultados de la optimizacion no fueron congruentes')
  }
}
function mapearContenidoBodegas (bodegas, esArreglo) {
  const mapBodegas = new Map()
  bodegas.forEach(function (bodegaContenido) {
    const idBodega = bodegaContenido.RowKey
    let arreglo = esArreglo ? [] : {}
    if (mapBodegas.has(idBodega)) {
      arreglo = mapBodegas.get(idBodega)
    }
    esArreglo ? arreglo.push(bodegaContenido.PartitionKey)
      : arreglo[bodegaContenido.PartitionKey] = bodegaContenido.unidades
    mapBodegas.set(idBodega, arreglo)
  })
  return mapBodegas
}
function armarCorreo (emailDestino, asunto, texto) {
  return {
    personalizations: [{
      'to': [{email: emailDestino}]
    }],
    subject: asunto,
    'content': [{
      'type': 'text/plain',
      'value': texto
    }]
  }
}

function actualizar (colaMsg) {
  const querys = []
  const nombreTabla = colaMsg.nombreTabla
  colaMsg.items.forEach(msg => {
    querys.push(ejecutarQuery(nombreTabla, msg))
  })
  return Promise.all(querys)
}
function ejecutarQuery (nombreTabla, item) {
  return new Promise((resolve) => {
    tableService.replaceEntity(nombreTabla, item, (error) => {
      resolve(error ? new Error(error) : 'OK')
    })
  })
}