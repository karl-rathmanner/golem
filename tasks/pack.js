import gulp from 'gulp'
import { colors, log } from 'gulp-util'
import zip from 'gulp-zip'
import packageDetails from '../package.json'
import args from './lib/args'

function getPackFileType () {
  switch (args.vendor) {
    case 'firefox':
      return '.xpi'
    default:
      return '.zip'
  }
}

export const pack = gulp.series('build', () => {
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
