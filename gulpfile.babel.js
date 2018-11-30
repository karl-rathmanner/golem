import gulp from 'gulp';
// import gulp from 'gulp'
import { colors, log } from 'gulp-util';
import zip from 'gulp-zip';
import packageDetails from './package.json';
import { changelog } from './tasks/changelog';
import { chromereload } from './tasks/chromereload';
import { clean } from './tasks/clean';
import { fonts } from './tasks/fonts';
import { images } from './tasks/images';
import args from './tasks/lib/args';
import { locales } from './tasks/locales';
import { manifest } from './tasks/manifest';
import { pages } from './tasks/pages';
import { schemScripts } from './tasks/schemScripts';
import { scripts } from './tasks/scripts';
import { styles } from './tasks/styles';

export { feature, patch, release } from './tasks/version';

/// building
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

/// testing

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

/// packing

function getPackFileType () {
  switch (args.vendor) {
    case 'firefox':
      return '.xpi'
    default:
      return '.zip'
  }
}

export const pack = gulp.series(build, () => {
  const name = packageDetails.name;
  const version = packageDetails.version;
  const filetype = getPackFileType();
  const filename = `${name}-${version}-${args.vendor}${filetype}`;
  return gulp.src(`dist/${args.vendor}/**/*`)
    .pipe(zip(filename))
    .pipe(gulp.dest('./packages'))
    .on('end', () => {
      let distStyled = colors.magenta(`dist/${args.vendor}`)
      let filenameStyled = colors.magenta(`./packages/${filename}`)
      log(`Packed ${distStyled} to ${filenameStyled}`)
    });
});