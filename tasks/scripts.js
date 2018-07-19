import gulp from 'gulp'
import gulpif from 'gulp-if'
import { log, colors } from 'gulp-util'
import named from 'vinyl-named'
import webpack from 'webpack'
import gulpWebpack from 'webpack-stream'
import plumber from 'gulp-plumber'
import livereload from 'gulp-livereload'
import args from './lib/args'

const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const ENV = args.production ? 'production' : 'development'

gulp.task('scripts', (cb) => {
  return gulp.src(['app/scripts/*.js', 'app/scripts/*.ts', 'app/scripts/*.schem', 'app/styles/*.css'])
    .pipe(plumber({
      // Webpack will log the errors
      errorHandler () {}
    }))
    .pipe(named())
    .pipe(gulpWebpack({
      devtool: args.sourcemaps ? 'inline-source-map' : false,
      watch: args.watch,
      mode: 'development',
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
          features: ['bracketMatching'],
          languages: ['json']
        })
        ].concat(args.production ? [
        // new webpack.optimize.UglifyJsPlugin(),  <- TODO: reenable later. (doesn't like es6?)
        new webpack.optimize.ModuleConcatenationPlugin()
      ] : []),
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
    .pipe(gulpif(args.watch, livereload()))
})
