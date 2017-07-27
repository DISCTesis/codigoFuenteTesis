const express = require('express')
const path = require('path')
const favicon = require('serve-favicon')
const logger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')

const app = express()

// Autenticacion
const passport = require('passport')
require('./passport/passport')(passport)
app.use(passport.initialize())
app.use(passport.session())

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(logger('dev'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

// Uso de cookies
app.use(function (req, res, next) {
  res.locals.hideLogin = !!req.cookies.empleado
  if (res.locals.hideLogin) {
    res.locals.empleado = req.cookies.empleado
  }
  next()
})

// Enrutamiento
const index = require('./routes/index')
const pedidos=require('./routes/pedido')
app.use('/', index)
app.use('/pedido',pedidos)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  const err = new Error('Not Found')
  err.status = 404
  next(err)
})
// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}
  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

module.exports = app


