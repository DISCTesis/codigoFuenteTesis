'use strict'
const Cloudant = require('cloudant')
const me = '' // TODO username en las credenciales de servicio en CloudantDB
const password = '' // TODO password en las credenciales de servicio en CloudantDB
const cloudant = Cloudant({account: me, password: password, plugin: 'retry'})
const db = cloudant.db.use('ccp')
const javascriptLpSolver = require('javascript-lp-solver')
const sendgrid = require('sendgrid')('') // TODO pegar la llave de los servicios de sendgrid entre las comillas simples
const solicitudCanceladaMsg = 'Solicitud de abastecimiento cancelada, codigo pedido: '
const unboundLpSolverMsg = 'Los resultados de la optimizacion no fueron congruentes'
const solicitudCompletaMsg = 'Solicitud de abastecimiento completa, codigo pedido: '
const bodegasSeleccionadasMsg = 'Se han seleccionado las siguientes bodegas: '
const errDesconocidoMsg = 'Error Desconocido'

function main (params) {
  const modelo = {
    'optimize': 'distancia',
    'opType': 'min',
    'constraints': {},
    'variables': {},
    'ints': {}
  }
  console.log("Estos son los params: "+JSON.stringify(params))
  const mapa = mapearContenidoBodegas(params.bodegas)
  inicializarModelo(modelo, params.distancias, params.pedido.items, mapa)
  console.log("Este es el modelo: "+JSON.stringify(modelo))
  const bodegasSeleccionadas = javascriptLpSolver.Solve(modelo)
  console.log("Este es resultado de la optimizacion: "+JSON.stringify(bodegasSeleccionadas))
  if (erroresEnOptimizacion(bodegasSeleccionadas)) {
    console.log('El modelo: ' + JSON.stringify(modelo))
    console.log(erroresEnOptimizacion(bodegasSeleccionadas))
    return new Error(unboundLpSolverMsg)
  } else {
    delete bodegasSeleccionadas.feasible
    delete bodegasSeleccionadas.result
    return crearSolicitudes(params.pedido, params.bodegas,
      bodegasSeleccionadas, params.operario, mapa)
  }
}
function persistirDatos (nDatos) {
  const querys = []
  nDatos.forEach(dato => querys.push(insertarDato(dato)))
  return Promise.all(querys)
}
function insertarDato (nDoc) {
  return new Promise((resolve, reject) => {
    db.insert(nDoc, null, err =>
      err ? reject(new Error('Error al persistir en BD: ' + err)) : resolve())
  })
}
function crearSolicitudes (pedido, inventarios, bodegas, operario, mapa) {
  let datosBD = null
  return Promise.all(darInventariosProductos(inventarios))
    .then(inventariosAct => {
      let mapaInventarios = mapearInventario(inventariosAct)
      datosBD = generarSolicitudesAbastecimiento(bodegas, mapa,
        pedido._id, operario._id, mapaInventarios)
      return persistirDatos(datosBD)
    })
    .then(() => {
      return enviarCorreo(operario.correo, solicitudCompletaMsg + pedido._id,
        bodegasSeleccionadasMsg + JSON.stringify(datosBD))
    })
    .then(() => {return {msg:'Actualizacion Completa'}})
    .catch(err => {
      console.error('Error: '+err)
      enviarCorreo(operario.correo, solicitudCanceladaMsg + pedido._id, errDesconocidoMsg)
      return err
    })
}
function mapearInventario (inventario) {
  const map = new Map()
  inventario.forEach(item => map.set(JSON.stringify({
    productoId: item.productoId,
    bodegaId: item.bodegaId,
  }), {unidades: item.unidades, _id: item._id, _rev: item._rev}))
  return map
}
function erroresEnOptimizacion (optimizacion) {
  if (!optimizacion) {
    return new Error('Error desconocido al optimizar')
  } else if (optimizacion.feasible === 'false' || optimizacion.result <= 0) {
    return new Error('Los resultados de la optimizacion no fueron congruentes')
  }
}
function inicializarModelo (modelo, distancias, items, mapaContenido) {
  console.log('Inicializando modelo, distancias: '+JSON.stringify(distancias))
  items.forEach((item) => {
    modelo.constraints[item.productoId] = {'min': item.cantidad}
  })
  distancias.forEach(distancia => {
    const bodegaId = distancia._id
    const bodegaVar = mapaContenido.get(bodegaId)
    bodegaVar['distancia'] = parseInt(distancia.distancia.replace(' km', '').replace(',', ''))
    modelo.variables[bodegaId] = bodegaVar
    modelo.ints[bodegaId] = 1
  })
}
function generarSolicitudesAbastecimiento (bodegasSeleccionadas, mapa, pedidoId, operarioId, mapaInv) {
  let cambiosBD = []
  for (const property in bodegasSeleccionadas) {
    if (bodegasSeleccionadas.hasOwnProperty(property)) {
      const propiedadesBodega = mapa.get(property)
      delete propiedadesBodega.distancia
      const solicitudBodega = {
        'bodegaId': property,
        'pedidoId': pedidoId,
        'operarioId': operarioId,
        'solicitudesProductos': [],
        'type': 'SolicitudAbastecimiento'
      }
      cambiosBD = cambiosBD.concat(generarSolicitudProductos(propiedadesBodega, solicitudBodega, mapaInv))
      cambiosBD.push(solicitudBodega)
    }
  }
  return cambiosBD
}
function generarSolicitudProductos (productosCantidad, solicitudAbastecimiento, mapaInventario) {
  const inventariosActualizados = []
  for (const producto in productosCantidad) {
    if (productosCantidad.hasOwnProperty(producto)) {
      const solicitudProducto = {
        'productoId': producto,
        'cantidad': productosCantidad[producto]
      }
      const invId = JSON.stringify({
        productoId: solicitudProducto.productoId,
        bodegaId: solicitudAbastecimiento.bodegaId
      })
      const invAct = mapaInventario.get(invId)
      if (invAct && invAct.unidades >= solicitudProducto.cantidad) {
        invAct.unidades = invAct.unidades - solicitudProducto.cantidad
        mapaInventario.set(invId, invAct)
        const inventario = JSON.parse(invId)
        inventario['unidades'] = invAct.unidades
        inventario['_id'] = invAct._id
        inventario['type'] = 'Inventario'
        inventario['_rev'] = invAct._rev
        inventariosActualizados.push(inventario)
        solicitudAbastecimiento.solicitudesProductos.push(solicitudProducto)
      } else {
        throw new Error('Inventario incompatible')
      }
    }
  }
  return inventariosActualizados
}
function mapearContenidoBodegas (bodegas) {
  const mapBodegas = new Map()
  bodegas.forEach(function (bodegaContenido) {
    const idBodega = bodegaContenido.bodegaId
    let arreglo = {}
    if (mapBodegas.has(idBodega)) {
      arreglo = mapBodegas.get(idBodega)
    }
    arreglo[bodegaContenido.productoId] = bodegaContenido.unidades
    mapBodegas.set(idBodega, arreglo)
  })
  return mapBodegas
}
function darInventariosProductos (nInventarios) {
  const query = []
  nInventarios.forEach(nInventario => {
    query.push(new Promise((resolve, reject) => {
      db.find({selector: {'_id': nInventario._id}}, (err, result) => {
        if (err) {
          reject(new Error('Error al consultar bodegas: ' + JSON.stringify(err)))
        } else {resolve(result.docs[0])}
      })
    }))
  })
  return query
}
function enviarCorreo (nEmail, sbject, msg) {
  const helper = require('sendgrid').mail
  const from = new helper.Email('js.castro125@uniandes.edu.co')
  const to = new helper.Email(nEmail)
  const content = new helper.Content('text/plain', msg)
  const mail = new helper.Mail(from, sbject, to, content)
  const req = sendgrid.emptyRequest({
    method: 'POST',
    path: '/v3/mail/send',
    body: mail.toJSON()
  })
  return sendgrid.API(req)
}
exports.main = main