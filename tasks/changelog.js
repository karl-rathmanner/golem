import gulp from 'gulp';
const markdown = require('gulp-markdown');
import args from './lib/args'

export const changelog = () => {
  return gulp.src('CHANGELOG.md')
    .pipe(markdown())
    .pipe(gulp.dest(`dist/${args.vendor}/pages`));
}