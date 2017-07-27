const aws = require('aws-sdk')
const ses = new aws.SES()
const ccpCorreo = 'js.castro125@uniandes.edu.co'
const ccp = 'Compania Comercializadora de Productos'
exports.enviar = (event, context, callback) => {
  const email = JSON.parse(event.Records[0].Sns.Message)
  if (email && email.asunto && email.destino && email.contenido) {
    enviarCorreo(email, (err, data) => {
      if (err) {
        console.log('Error al enviar mensaje: ' + err)
        callback(new Error('Error al enviar mensaje: ' + err))
      } else {
        console.log('Correo enviado a: ' + email.destino + ' desde :' + email)
        callback(null, data)
      }
    })
  } else {
    const error = new Error('Parametros no validos, recibidos: ' + JSON.stringify(event,null,2))
    console.log(error)
    callback(error)
  }
}
function enviarCorreo (email, cb) {
  const params = {
    RawMessage: {Data: new Buffer(escribirCorreo(email.asunto, email.destino, email.contenido))},
    Destinations: [email.destino],
    Source: ccp + ' <' + ccpCorreo + '>\''
  }
  ses.sendRawEmail(params, cb)
}
function escribirCorreo (subject, toMail, text) {
  let ses_mail = 'From: ' + ccp + ' <' + ccpCorreo + '>\n'
  ses_mail = ses_mail + 'To: ' + toMail + '\n'
  ses_mail = ses_mail + 'Subject: ' + subject + '\n'
  ses_mail = ses_mail + 'MIME-Version: 1.0\n'
  ses_mail = ses_mail + 'Content-Type:  text/html;charset=us-ascii\n\n'
  ses_mail = ses_mail + text + '.\n\n'
  console.log('Este es el mail: ', ses_mail)
  return ses_mail
}
