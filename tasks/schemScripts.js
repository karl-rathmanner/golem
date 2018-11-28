import gulp from 'gulp';
import args from './lib/args';

export const schemScripts = () => {
  return gulp.src('app/scripts/schemScripts/*.schem')
    .pipe(gulp.dest(`dist/${args.vendor}/schemScripts`));
};