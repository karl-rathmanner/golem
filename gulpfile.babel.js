import gulp from 'gulp';
import { chromereload } from './tasks/chromereload';
import { clean } from './tasks/clean';
import { fonts } from './tasks/fonts';
import { images } from './tasks/images';
import { locales } from './tasks/locales';
import { manifest } from './tasks/manifest';
import { pages } from './tasks/pages';
import { schemScripts } from './tasks/schemScripts';
import { scripts } from './tasks/scripts';
import { styles } from './tasks/styles';
import { changelog } from './tasks/changelog';


let Server = require('karma').Server

export const test = (done) => {
  new Server({
    configFile: require('path').resolve('karma.conf.js')
  }, (err) => {
    if (err === 0) {
      done();
    } else {
      done(new gutil.PluginError('karma', {
        message: `Karma Tests failed: ${err}`
      }));
    }
  }).start();
};

export const build = gulp.series(
  clean, 
  gulp.parallel(
    manifest,
    scripts,
    schemScripts, 
    styles,
    pages,
    locales,
    images,
    fonts,
    chromereload,
    changelog
  )
);

export default build;