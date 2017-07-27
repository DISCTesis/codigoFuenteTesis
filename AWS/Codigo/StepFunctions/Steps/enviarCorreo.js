const AWS = require('aws-sdk')
const sns = new AWS.SNS()
module.exports.enviar = function (event, context, callback) {
  console.log("El evento es: "+JSON.stringify(event,null,2))
  let datos=event.Cause?JSON.parse(JSON.parse(event.Cause).errorMessage):event
  if(datos && datos.destino && datos.asunto && datos.contenido) {
    const payload = {}
    payload.default = JSON.stringify({
      "destino": datos.destino,
      "asunto": datos.asunto,
      "contenido": datos.contenido
    })
    sns.publish({
      Message: JSON.stringify(payload),
      MessageStructure: 'json',
      TargetArn: "arn:aws:sns:us-east-1:255410818070:enviarCorreo" //TODO ACTUALIZAR CON DATOS DE LA NUEVA SNS
    }, function (err) {
      if (err) {
        console.log("Ocurrio un error al enviar correo: " + err.stack)
        callback(new Error("Ocurrio un error al enviar correo: " + err.stack))
      } else {
        console.log('Correo Enviado')
        callback(null, "Correo Enviado")
      }
    })
  } else {
    callback(new Error("Parametros no validos"))
  }
}