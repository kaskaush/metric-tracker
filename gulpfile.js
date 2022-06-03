const { src, dest, task } = require('gulp');
const uglify = require('gulp-uglify');
const pipeline = require('readable-stream').pipeline;

function build() {
    return pipeline(src('src/index.js'), uglify(), dest('dist'));
}

exports.build = build;
