const gulp = require('gulp');
const postcss = require('gulp-postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const sourcemaps = require('gulp-sourcemaps');
const dartSass = require('sass');
const gulpSass = require('gulp-sass')(dartSass);
const path = require('node:path');

const paths = {
  tailwindEntry: 'src/styles/tailwind.css',
  scss: 'src/styles/scss/**/*.scss',
  assets: 'assets',
  // Tailwind should rebuild when liquid or JSON templates change
  contentGlobs: [
    'layout/**/*.{liquid,json}',
    'sections/**/*.{liquid,json}',
    'snippets/**/*.{liquid,json}',
    'templates/**/*.{liquid,json}',
    'blocks/**/*.{liquid,json}',
    'locales/**/*.json'
  ]
};

function buildTailwind() {
  return gulp.src(paths.tailwindEntry, { allowEmpty: true })
    .pipe(sourcemaps.init())
    .pipe(postcss([
      tailwindcss(path.resolve('tailwind.config.js')),
      autoprefixer()
    ]))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(paths.assets));
}

function buildScss() {
  return gulp.src(paths.scss, { sourcemaps: true, allowEmpty: true })
    .pipe(gulpSass({ outputStyle: 'compressed' }).on('error', gulpSass.logError))
    .pipe(gulp.dest(paths.assets, { sourcemaps: '.' }));
}

function build(done) {
  return gulp.parallel(buildTailwind, buildScss)(done);
}

function watch() {
  gulp.watch([paths.tailwindEntry, ...paths.contentGlobs], buildTailwind);
  gulp.watch(paths.scss, buildScss);
}

exports.build = build;
exports.watch = watch;
exports.default = gulp.series(build, watch);


