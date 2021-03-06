var utils = require('../utils'),
    format = require('../utils/format'),
    file = require('../utils/file'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore');

var uglifyjs = require('uglify-js');


exports.summary = 'Minify javascript files with uglifyjs';

exports.usage = '<source> [options]';

exports.options = {
    "d" : {
        alias : 'dest'
        ,default : '<source>'
        ,describe : 'destination directory or file'
    },

    "s" : {
        alias : 'suffix'
        ,default : '.min'
        ,describe : 'destination file suffix append'
    },

    "c" : {
        alias : 'charset'
        ,default : 'utf-8'
        ,describe : 'file encoding type'
    }
};

exports.run = function (opt, callback) {

    //console.log(args.argv);
    var source = opt.source,
        dest = opt.dest,
        charset = opt.charset,
        suffix = opt.suffix;

    var options = opt['options'];

    try {
         // only find *.js file
        if(file.isDir(source)){
            source = path.join(source, "*.js");
        }

        file.globSync(source).forEach(function(inputFile){

            var outputFile = inputFile;

            // console.log(dest, file.isDirFormat(dest));

            if(file.isDirFormat(dest)){
                outputFile = path.join(dest , path.basename(outputFile) );

                // suffix
                if(suffix)
                    outputFile = file.suffix(inputFile, suffix);

            }else{
                outputFile = dest;
            }

            task(inputFile, outputFile, options ,charset);  // TODO

        });

        callback();

    }catch (err){
        return callback(err);
    }

};


var task = exports.task = function(inputFile, outputFile, options, charset){

    charset = charset || "utf-8";

    // more: https://github.com/mishoo/UglifyJS
    var defaultOptions = {

        consolidate: false,
        show_copyright: true,
        max_line_length: 32 * 1024,
        lift_vars: false,

        mangle: true,
        mangle_toplevel: false,
        no_mangle_functions: false,
        defines: { },
        reserved: null,

        squeeze: true,
        make_seqs: true,
        dead_code: true,
        unsafe: false,


        // for gen_code fn
        ascii_only: true,
        beautify: false,
        indent_level: 4,
        indent_start: 0,
        quote_keys: false,
        space_colon: false,
        inline_script: false

    };

    options = options || defaultOptions;

    var jsp = uglifyjs.parser;
    var pro = uglifyjs.uglify;
    var consolidator = uglifyjs.consolidator
    var ast, pos;
    var input = file.read(inputFile, charset);

    if(utils.isMinified(input)){
        exports.log("Skipping minified file " + inputFile);
    }
    // skip empty files
    else if (input.length) {

        exports.log("Minifying " + inputFile + " > " + outputFile);

        var result = "";
        if (options.show_copyright) {
            var tok = jsp.tokenizer(input), c;
            c = tok();
            result += getCopyright(c.comments_before);
        }

        try {
            ast = jsp.parse(input);

            if (options.consolidate) {
                ast = consolidator.ast_consolidate(ast);
            }

            if (options.lift_vars) {
                ast = pro.ast_lift_variables(ast);
            }

            ast = pro.ast_mangle(ast, {
                mangle       : options.mangle,
                toplevel     : options.mangle_toplevel,
                defines      : options.defines,
                except       : options.reserved,
                no_functions : options.no_mangle_functions
            });

            if(options.squeeze){

                ast = pro.ast_squeeze(ast, {
                    make_seqs  : options.make_seqs,
                    dead_code  : options.dead_code,
                    keep_comps : !options.unsafe,
                    unsafe     : options.unsafe
                });

                if (options.unsafe)
                    ast = pro.ast_squeeze_more(ast);
            }


            var minimized = pro.gen_code(ast, options);


            if (!options.beautify && options.max_line_length) {
                minimized = pro.split_lines(minimized, options.max_line_length);
            }

            // output = copyright + minimized
            result += minimized;


            file.write(outputFile, result, charset);

            var diff = input.length - minimized.length,
                savings = input.length ? ((100 * diff) / minimized.length).toFixed(2) : 0;
            var info = 'Original size: ' + format.commify(input.length)  +
                '. Minified size: ' + format.commify(minimized.length) +
                '. Savings: ' + format.commify(diff) + ' (' + savings + '%)';

            exports.log(info);


        } catch(e) {
            // Something went wrong.

            pos = '['.red + ('L' + e.line).yellow + ':'.red + ('C' + e.col).yellow + ']'.red;
            throw Error( pos + ' ' + (e.message + ' (position: ' + e.pos + ')').yellow );

        }


    } else {

        exports.log("Skipping empty file " + inputFile);
    }

};



function getCopyright(comments) {
    var ret = "";
    for (var i = 0; i < comments.length; ++i) {
        var c = comments[i];
        if (c.type == "comment1") {
            ret += "//" + c.value + "\n";
        } else {
            ret += "/*" + c.value + "*/";
        }
    }
    return ret;
}