var test = require('tape')
var each = require('each-async')
var hammock = require('hammock')
var isEqual = require('is-equal');
var cuid = require('cuid')

var levelup = require('levelup')
var db = levelup('db', { db: require('memdown') })

var secret = 's3cr3t_Pa55w0rd'
var auth = require('../lib/auth')(secret)
var accountsModel = require('../model')(db)
var accountsHandler = require('../handler')(accountsModel, { auth: auth })

// Make a request to get the initial token
var request = hammock.Request({
  method: 'GET',
  headers: {
    'content-type': 'application/json'
  },
  url: '/somewhere'
})

request.end()
var payload = { username: "joeblow", admin: true }
var token = auth.tokens.sign(request, payload)

test('verify token', function (t) {
  var response = hammock.Response()
  request.headers.authorization = 'Bearer ' + token
  auth.verify(request, function (err, decoded) {
    t.ifError(err)
    t.ok(decoded)
    t.end()
  })
})


test('invalid token verification', function (t) {
  var request = hammock.Request({
    method: 'GET',
    headers: {
      'content-type': 'application/json'
    },
    url: '/somewhere'
  })

  // NO Token is set, so this auth should fail!
  request.end('thisbody')

  auth.verify(request, function (err, decoded) {
    t.ok(err)
    t.notOk(decoded)
    t.end()
  })
})

test('get a list of accounts', function (t) {
  var accountsFixture = JSON.parse(JSON.stringify(require('./fixtures/accounts.js')))
  createAccounts(t, accountsFixture, function(expectedAccounts) {
    var request = hammock.Request({
      method: 'GET',
      headers: {
        'content-type': 'application/json'
      },
      url: '/somewhere'
    })
    request.headers.authorization = 'Bearer ' + token
    request.end('thisbody')

    var response = hammock.Response()
    accountsHandler.index(request, response) // without a callback, accounts is `undefined`

    response.on('end', function (err, data) {
      t.ifError(err, 'there is no error')
      t.true(200 === data.statusCode, 'statusCode is 200')
      var accounts = JSON.parse(data.body)
      // remove the emails, which have been stripped from the response's accounts
      for (var i = 0; i < expectedAccounts.length; i++) {
        var expectedAccount = expectedAccounts[i]
        delete expectedAccount.email
      }
      t.ok(isEqual(accounts, expectedAccounts))
      t.end()
    });
  })
})

test('auth sign in to existing account', function (t) {
  var accountsFixture = JSON.parse(JSON.stringify(require('./fixtures/accounts.js')))
  var accountToAuth = accountsFixture[0]

  var creds = { username: accountToAuth.value.username,
    password: accountToAuth.login.basic.passowrd }
  var request = hammock.Request({
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      'authorization': '' + creds.username + ":" + creds.password
    },
    url: '/somewhere'
  })

  request.end('thisbody')

  var response = hammock.Response()
  accountsHandler.authBasic(request, response)

  response.on('end', function (err, data) {
    t.ifError(err)
    t.true(200 === data.statusCode)
    // TODO: Check that we have the right auth token
    // TODO: data.body cannot be properly compared due to bug in npm's hammock
    // that causes the body to be repeated twice when it is piped into the response:
    // https://github.com/tommymessbauer/hammock/issues/15
    t.end()
  })
})

test('invalid auth sign in', function (t) {
  //var creds = { username: accountToAuth.value.username,
  //  password: accountToAuth.login.basic.passowrd }
  var request = hammock.Request({
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      'authorization': 'fakename:doesnotexist'
    },
    url: '/somewhere'
  })
  request.end('thisbody')

  var response = hammock.Response()
  accountsHandler.authBasic(request, response)

  response.on('end', function (err, data) {
    t.ifError(err)
    t.true(401 === data.statusCode)
    t.end()
  })
})

/*
// temporarily commenting this out in preparation for permissions that will replace admin property
test('delete a single account as non-admin', function (t) {
  var request = hammock.Request({
    method: 'GET',
    headers: {
      'content-type': 'application/json'
    },
    url: '/somewhere'
  })

  request.end()
  var payload = { username: "joeblow" }
  var nonAdminToken = auth.tokens.sign(request, payload)

  var accountsFixture = JSON.parse(JSON.stringify(require('./fixtures/accounts.js')))
  var accountToDelete = accountsFixture[0].login.basic
  var request = hammock.Request({
    method: 'DELETE',
    headers: {
      'content-type': 'application/json'
    },
    url: '/somewhere'
  })
  request.headers.authorization = 'Bearer ' + nonAdminToken // 'token' is a jwt with login creds
  request.end('thisbody')

  var response = hammock.Response()
  accountsHandler.item(request, response, { params: {key: accountToDelete.key }})

  response.on('end', function (err, data) {
    t.ifError(err)
    t.true(401 === data.statusCode)
    t.end()
  })
})
*/

test('DELETE an account', function (t) {
  var accountsFixture = JSON.parse(JSON.stringify(require('./fixtures/accounts.js')))
  var accountToDelete = accountsFixture[0].login.basic
  var request = hammock.Request({
    method: 'DELETE',
    headers: {
      'content-type': 'application/json'
    },
    url: '/somewhere'
  })
  request.headers.authorization = 'Bearer ' + token // 'token' is a jwt with login creds
  request.end('thisbody')

  var response = hammock.Response()
  accountsHandler.item(request, response, { params: {key: accountToDelete.key }})

  response.on('end', function (err, data) {
    t.ifError(err)
    t.true(200 === data.statusCode)
    t.end()
  })
})

var testAccount
test('POST an account', function (t) {
  testAccount = { key: cuid(), username: "yup", email: "ok@joeblow.com", password: "poop"}
  var request = hammock.Request({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/somewhere'
  })
  request.headers.authorization = 'Bearer ' + token // 'token' is a jwt with login creds
  request.end(JSON.stringify(testAccount))

  var response = hammock.Response()
  accountsHandler.index(request, response, { params: {key: testAccount.key }})

  response.on('end', function (err, data) {
    t.ifError(err)
    t.true(200 === data.statusCode)
    t.end()
  })
})

// GET the account we just created in POST
test('GET an account', function (t) {
  var request = hammock.Request({
    method: 'GET',
    headers: {
      'content-type': 'application/json'
    },
    url: '/somewhere'
  })
  request.headers.authorization = 'Bearer ' + token // 'token' is a jwt with login creds
  request.end(JSON.stringify(testAccount))

  var response = hammock.Response()
  accountsHandler.item(request, response, { params: {key: testAccount.key }})

  response.on('end', function (err, data) {
    t.ifError(err)
    t.true(200 === data.statusCode)
    // TODO: data.body cannot be properly compared due to bug in npm's hammock
    // that causes the body to be repeated twice when it is piped into the response:
    // https://github.com/tommymessbauer/hammock/issues/15
    t.end()
  })
})

// PUT the account we just created in POST
test('PUT an account', function (t) {
  var putAccount = { username: "yup2", email: "ok2@joeblow.com"}
  var request = hammock.Request({
    method: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    url: '/somewhere'
  })
  request.headers.authorization = 'Bearer ' + token // 'token' is a jwt with login creds
  request.end(JSON.stringify(putAccount))

  var response = hammock.Response()
  accountsHandler.item(request, response, { params: {key: testAccount.key }})

  response.on('end', function (err, data) {
    t.ifError(err)
    t.true(200 === data.statusCode)
    // TODO: data.body cannot be properly compared due to bug in npm's hammock
    // that causes the body to be repeated twice when it is piped into the response:
    // https://github.com/tommymessbauer/hammock/issues/15
    t.end()
  })
})

function createAccounts(t, accountsData, cb) {
  each(accountsData, iterator, end)
  var expectedAccounts = []

  function iterator(account, i, done) {
    expectedAccounts.push(account.value)

    accountsModel.create(account, function (err, created) {
      t.notOk(err)
      t.ok(created)
      done()
    })
  }

  function end() {
    cb(expectedAccounts)
  }
}

function deleteAccounts(t, accountsData) {
  each(accountsData, iterator, end)

  function iterator(account, i, done) {

    accountsModel.findOne(account.value.username, function (err, accountValue) {
      t.notOk(err)
      t.ok(accountValue)
      accountsModel.delete(accountValue.key, function (err, accountValue) {
        done()
      })
    })
  }

  function end() {
  }
}