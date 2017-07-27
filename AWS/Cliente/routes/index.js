const express = require('express')
const router = express.Router()
const passport = require('passport')

/* GET home page. */
router.get('/', function (req, res) {
  res.render('index', {title: 'CCP'})
})

// Autentica el usuario
router.post('/', function (req, res, next) {
  passport.authenticate('local', function (err, user) {
    if (err || !user) {
      return res.redirect('/')
    }
    req.logIn(user, function (err) {
      if (err) {
        return next(err)
      }
      // store session if necessary
      res.cookie('empleado', user)
      res.redirect('/pedido')
    })
  })(req, res, next)
})

module.exports = router
