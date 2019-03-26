import gulp from 'gulp';
import livereload from 'gulp-livereload';
import gutil from 'gulp-util';
import { fonts } from './fonts';
import { images } from './images';
import args from './lib/args';
import { locales } from './locales';
import { manifest } from './manifest';
import { pages } from './pages';
import { schemScripts } from './schemScripts';
import { stylesCss, stylesLess, stylesSass } from './styles';
import { changelog } from './changelog';

// In order to make chromereload work you'll need to include
// the following lines in your `scipts/background.ts` file.
//
// if (process.env.NODE_ENV === 'development') {
//   require('chromereload/devonly');
// }
//
// This will reload your extension everytime a file changes.
// If you just want to reload a specific context of your extension
// (e.g. `pages/options.html`) include the script in that context
// (e.g. `scripts/options.js`).
//
// Please note that you'll have to restart the gulp task if you
// create new file. According to the original authors of this file,
// that would be something that you could fix with gulp 4.
// TODO: fix chromereload not tracking new files

export const chromereload = (cb) => {
  // This task runs only if the
  // watch argument is present!
  if (!args.watch) {
    return cb();
  }

  // Start livereload server
  livereload.listen({
    reloadPage: 'Extension',
    quiet: !args.verbose
  });

  gutil.log('Starting', gutil.colors.cyan('\'livereload-server\''));

  // The watching for javascript files is done by webpack
  // Check out ./tasks/scripts.js for further info.
  gulp.watch('app/manifest.json', manifest);
  gulp.watch('app/styles/**/*.css', stylesCss);
  gulp.watch('app/styles/**/*.less', stylesLess);
  gulp.watch('app/styles/**/*.scss', stylesSass);
  gulp.watch('app/pages/**/*.html', pages);
  gulp.watch('app/_locales/**/*', locales);
  gulp.watch('app/images/**/*', images);
  gulp.watch('app/fonts/**/*.{woff,ttf,eot,svg}', fonts);
  gulp.watch('app/scripts/schemScripts/**/*', schemScripts);
  gulp.watch('CHANGELOG.md', changelog);

  cb();
}