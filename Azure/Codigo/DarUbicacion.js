'use strict'
const googleMapsClient = require('@google/maps').createClient({
  key: '' //TODO pegar la llave de servicios de Google Mpas entre las comillas simples
})
module.exports.darDistancias = function (context, colaMsg, bodegasBD) {
  context.log(JSON.stringify(colaMsg))
  context.log(JSON.stringify(bodegasBD))
  const idBodegas=[]
  const mapBodegas=bodegasUbicacion(bodegasBD,colaMsg.bodegas)
  const destinos = cargarDestinos(mapBodegas,idBodegas)
  const ubicacionGeografica = colaMsg.pedido.ubicacionGeografica
  calcularDistancia(ubicacionGeografica.latitud + ',' + ubicacionGeografica.longitud,
    destinos, function (err, res) {
      if (err) {
        context.log.error('Error en google maps: ' + err)
        context.bindings.email={
            to: colaMsg.operario.correo,       
            subject: 'Solicitud de abastecimiento cancelada, codigo pedido: ' + colaMsg.pedido.PartitionKey,
            content: [{
                type: 'text/plain',
                value: 'Error al solicitar ubicacion de bodega'
            }]
        }
        context.done(err)
      } else {
        const distancias=darDistancias(res, idBodegas)
        context.log(distancias)
        context.done(null, {
          distancias: distancias,
          bodegas: colaMsg.bodegas,
          pedido: colaMsg.pedido,
          operario: colaMsg.operario
        })
      }
    })
}

function bodegasUbicacion (bodegas, bodegasMsg) {
  const mapBodegas = new Map()
  const mapResp = new Map()
  bodegas.forEach(bodega => {
    mapBodegas.set(bodega.PartitionKey, JSON.parse(bodega.ubicacionGeografica))
  })
  bodegasMsg.forEach(bodegaMsg => {
    mapResp.set(bodegaMsg.RowKey, mapBodegas.get(bodegaMsg.RowKey))
  })
  return mapResp
}
function darDistancias (googleRes, ids) {
  const distancias = []
  googleRes.json.rows.forEach(function (fila) {
    fila.elements.forEach(function (elemento, index) {
      distancias.push({
        '_id': ids[index],
        'distancia': elemento.distance.text
      })
    })
  })
  return distancias
}
function cargarDestinos (mapBodegas,idBodegas) {
  let destinos = ''
  mapBodegas.forEach(function (ubicacion, idBodega) {
    destinos += ubicacion.latitud.toString() + ',' + ubicacion.longitud.toString() + '|'
    idBodegas.push(idBodega)
  })
  return destinos
}
function calcularDistancia (origen, destinos, cb) {
  googleMapsClient.distanceMatrix({
    origins: origen,
    destinations: destinos
  }, cb)
}