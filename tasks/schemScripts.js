import gulp from 'gulp';
import args from './lib/args';

gulp.task('schemScripts', function () {
  return gulp.src('app/scripts/schemScripts/*.schem')
    .pipe(gulp.dest(`dist/${args.vendor}/schemScripts`));
})
