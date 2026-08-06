// node test/index.js   (or: npm test)
const { run } = require('./support')

require('./capture.test')
require('./workspace.test')
require('./retention.test')
require('./view.test')
require('./server.test')

run()
