import gulp from 'gulp';
import args from './lib/args';

export const libraries = () => {
  return gulp.src('app/scripts/libraries/*.js')
    .pipe(gulp.dest(`dist/${args.vendor}/libraries`));
};