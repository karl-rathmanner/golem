import gulp from 'gulp';
import gulpif from 'gulp-if';
import livereload from 'gulp-livereload';
import plumber from 'gulp-plumber';
import { colors, log } from 'gulp-util';
import named from 'vinyl-named';
import webpack from 'webpack';
import gulpWebpack from 'webpack-stream';
import args from './lib/args';

const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const ENV = args.production ? 'production' : 'development'

export const scripts = () => {
  return gulp.src(['app/scripts/*.js', 'app/scripts/*.ts', 'app/scripts/*.schem', 'app/styles/*.css'])
    .pipe(plumber({
      // Webpack will log the errors
      errorHandler () {}
    }))
    .pipe(named())
    .pipe(gulpWebpack({
      devtool: args.sourcemaps ? 'inline-source-map' : false,
      watch: args.watch,
      mode: args.production ? 'production' : 'development',
      output : {
        publicPath: '/scripts/' // the MonacoWebpackPlugin needs this
      },
      plugins: [
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(ENV),
          'process.env.VENDOR': JSON.stringify(args.vendor)
        }),
        new MonacoWebpackPlugin({
          output: 'monaco/',
          // features: ['bracketMatching', 'suggest'], <-- TODO: pick and choose features?
          languages: ['json']
        })
      ],
      module: {
        rules: [
          {
            test: /\.ts$/,
            loader: 'ts-loader',
            exclude: /node_modules/,
            options: {
              configFile: 'tsconfig.app.json'
            }
          },
          {
            test: /\.css$/,
            use: [ 'style-loader', 'css-loader' ]
          },
          {
            test: /\.schem$/,
            loader: 'raw-loader'
          }
        ]
      },
      resolve: {
        extensions: ['.ts', '.js', '.css'],
        modules: [
          'node_modules/',
          'app/scripts/',
          'app/styles/'
        ]
      }
    },
    webpack,
    (err, stats) => {
      if (err) return
      log(`Finished '${colors.cyan('scripts')}'`, stats.toString({
        chunks: false,
        colors: true,
        cached: false,
        children: false
      }))
    }))
    .pipe(gulp.dest(`dist/${args.vendor}/scripts`))
    .pipe(gulpif(args.watch, livereload()));
};