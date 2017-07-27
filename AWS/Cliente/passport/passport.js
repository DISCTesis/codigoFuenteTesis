const LocalStrategy = require('passport-local').Strategy
const express = require('express')
const db = require('../utils/parametrosDynamo')

module.exports = function (passport) {
  passport.serializeUser(function (user, done) {
    done(null, user)
  })
  passport.deserializeUser(function (obj, done) {
    done(null, obj)
  })
  passport.use(new LocalStrategy({}, function (email, password1, done) {
    db.get('Empleado', {_id: email})
      .then(empleado => {
        return empleado ? done(null, empleado) : done(null, false)
      })
      .catch(err => {
        console.error(err)
        return done(null, false)
      })
  }))
}