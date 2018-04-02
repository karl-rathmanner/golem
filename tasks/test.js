let gulp = require('gulp')
let gutil = require('gulp-util')
let Server = require('karma').Server

gulp.task('test', (done) => {
  new Server({
    configFile: require('path').resolve('karma.conf.js')
  }, (err) => {
    if (err === 0) {
      done()
    } else {
      done(new gutil.PluginError('karma', {
        message: `Karma Tests failed: ${err}`
      }))
    }
  }).start()
})
