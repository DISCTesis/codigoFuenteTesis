const express = require('express')
const router = express.Router()
const db = require('../utils/parametrosDynamo')
const request = require('request-json')
const client = request.createClient('https://enviospedido.azurewebsites.net/') // TODO ajustar a la url de servicio de AWS


/* GET lista de pedidos*/
router.get('/', function (req, res) {
  db.scan('Pedido')
    .then(pedidos => {
      res.render('pedidos', {
        title: 'Lista de pedidos registrados',
        arreglo: pedidos,
        url: '/pedido/',
        numeroAccion: 0
      })
    })
    .catch(err => manejadorError(res, err))
})

//GET procesar Pedido
router.get('/:pedidoId/procesarPedido', (req, res) => {
  db.get('Pedido', {_id: req.params.pedidoId})
    .then(pedido => {
      const contenidoReq = {operario: req.cookies.empleado, pedido: pedido}
      const solicitud = {
        'input': JSON.stringify(contenidoReq),
        'stateMachineArn': 'arn:aws:states:us-east-1:255410818070:stateMachine:solicitud-dev-procesarSolicitudPedido' // TODO ajustar a la url de servicio de AWS
      }
      client.post('https://lw8zj2j136.execute-api.us-east-1.amazonaws.com/dev/solicitud', solicitud, (err, resServer, body) => {  // TODO ajustar a la url de servicio de AWS
        if (resServer.statusCode === 200 && body && body.startDate) {
          res.redirect('/pedido/' + req.params.pedidoId + '/solicitudAbastecimiento')
        } else {
          manejadorError(req, 'Error en el server al procesar solicitud')
        }
      })
    })
    .catch(err => manejadorError(res, err))
})

// GET Solicitudes
router.get('/:pedidoId/solicitudAbastecimiento', (req, res) => {
  db.scan('SolicitudAbastecimiento', 'pedidoId = :nPedido', {':nPedido': req.params.pedidoId})
    .then(solicitudes => {
      res.render('pedidos', {
        title: 'Lista de solicitudes de abastecimiento para el pedido con codigo: ' + req.params.pedidoId,
        arreglo: solicitudes,
        url: '/pedido/',
        numeroAccion: 1
      })
    })
    .catch(err => manejadorError(res, err))
})

// GET Envios del pedido
router.get('/:pedidoId/envio', (req, res) => {
  db.scan('Envio', 'pedidoId=:nPedidoId', {':nPedidoId': req.params.pedidoId})
    .then(envios => {
      res.render('pedidos', {
        title: 'Lista de envios para el pedido con codigo: ' + req.params.pedidoId,
        arreglo: envios,
        url: '/pedido/',
        numeroAccion: 2
      })
    })
    .catch(err => manejadorError(res, err))
})

// GET formulario para crear un envío
router.get('/:pedidoId/bodega/:bodegaId/envio', (req, res) => {
  res.render('crearUsuario', {
    title: 'Crear un envío para el pedido: '+req.params.pedidoId+' desde la bodega: '+req.params.bodegaId,
    pedidoId: req.params.pedidoId,
    bodegaId: req.params.bodegaId
  })
})

// Post envio
router.post('/:pedidoId/bodega/:bodegaId/envio', (req, res) => {
  const solicitud = {
    conductorId: req.body.conductorId,
    fechaDeEntrega: req.body.fechaDeEntrega,
    fechaDeSalida: req.body.fechaDeSalida
  }
  client.post('https://ozq7bozi5k.execute-api.us-east-1.amazonaws.com/dev/pedido/' + req.params.pedidoId + '/solicitud/' + req.params.bodegaId + '/envio',  // TODO ajustar a la url de servicio de AWS
    solicitud, (err, resServer, body) => {
      if (err || resServer.statusCode != 200) {
        manejadorError(res, 'Error en el server al crear envío')
      } else {
        console.log('Listo el envío')
        res.redirect('/pedido/'+req.params.pedidoId +'/envio')
      }
    })
})

function manejadorError (res, msg, cod) {
  console.error(msg)
  res.sendStatus(cod ? cod : 304)
}

module.exports = router
