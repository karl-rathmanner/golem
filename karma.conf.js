module.exports = function (config) {
  config.set({
    basePath: './',
    // frameworks (https://www.npmjs.com/search?q=keywords:karma-adapter)
    frameworks: ['mocha', 'sinon-chrome', 'chai'],
    // list of files to load
    files: [
      //'app/scripts/**/*.ts',
      'test/**/*.spec.ts'
    ],
    // preprocessors (https://www.npmjs.com/search?q=keywords:karma-preprocessor)
    preprocessors: {
      '**/*.ts': ['webpack', 'sourcemap']
    },
    client: {
      // enable html output
      mocha: {reporter: 'html', ui: 'bdd'}
    },
    mime: {
      'text/x-typescript': ['ts'] // otherwise webpack does not find the ts-files
    },

    webpack: {
      devtool: 'inline-source-map',
      stats: 'none',
      mode: 'development',
      module: {
        rules: [
          {
            test: /\.ts$/,
            loader: 'awesome-typescript-loader',
            exclude: /node_modules/,
            options: {
              configFile: 'tsconfig.spec.json' // use this config
            }
          }
        ]
      },
      resolve: {
        extensions: ['.ts', '.js'],
        modules: [
          'node_modules/',
          'app/scripts/',
          'test/scripts/'
        ]
      }
    },
    reporters: ['mocha'],
    port: 9876,
    colors: true,
    autoWatch: true,
    browsers: ['Chrome'],
    singleRun: false
  })
}
