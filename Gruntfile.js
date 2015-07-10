module.exports = function(grunt) {

	grunt.initConfig({

		// Import package manifest
		pkg: grunt.file.readJSON("package.json"),

		// Banner definitions
		meta: {
			banner: "/*\n" +
				" *  <%= pkg.title || pkg.name %> - v<%= pkg.version %>\n" +
				" *  <%= pkg.description %>\n" +
				" *  <%= pkg.homepage %>\n" +
				" *\n" +
				" *  Copyright BloomAPI, Inc. (c) 2015 \n" +
				" *  Copyright <%= pkg.author.name %> (c) 2015 \n" +
				" *  Under <%= pkg.license %> License\n" +
				" */\n"
		},

		file: {
			name: "autocomplete-<%= pkg.version %>",
		},

		// Concat all JS into one file
		concat: {
			options: {
				banner: "<%= meta.banner %>"
			},
			dist: {
				src: ["dist/<%= file.name %>.js"],
				dest: "dist/<%= file.name %>.js"
			}
		},

		//minifies and cleanup out inline CSS
		cssmin: {
		  target: {
		    files: {
		      'build/autocomplete.min.css': ['src/autocomplete.css']
		    }
		  }
		},

		// Lint definitions
		jshint: {
			files: ["src/autocomplete.js"],
			options: {
				jshintrc: ".jshintrc"
			}
		},


		// Minify definitions
		uglify: {
			my_target: {
				src: ["dist/<%= file.name %>.js"],
				dest: "dist/<%= file.name %>.min.js"
			},
			options: {
				banner: "<%= meta.banner %>"
			}
		},

		aws: grunt.file.readJSON("credentials.json"),

		s3: {
		  options: {
		    accessKeyId: "<%= aws.accessKeyId %>",
		    secretAccessKey: "<%= aws.secretAccessKey %>",
		    bucket: "cdn.bloomapi.com"
		  },
		  js: {
		    cwd: "dist/",
		    src: "*-<%= pkg.version %>*.js",
		    dest: "assets/js/"
		  },
		  img: {
		    cwd: "src/",
		  	src: "powered_by_bloom_on_white.png",
		  	dest: "assets/img/"
		  }
		},

		//Clean up the mess
		clean: ["dist/*", "build/*"],

		'string-replace': {
		  dist: {
		    files: {
		      'dist/<%= file.name %>.js': 'src/*.js',
		    },
		    options: {
		      replacements: [
		        // place files inline example 
		        {
		          pattern: 'AUTOCOMPLETE_CSS',
		          replacement: "<%= grunt.file.read('build/autocomplete.min.css') %>"
		        }
		      ]
		    }
		  }
		},

		//watch src for changes.
		watch: {
		    files: ['src/*'],
		    tasks: ['default']
		}
	});


	grunt.loadNpmTasks("grunt-contrib-concat");
	grunt.loadNpmTasks("grunt-contrib-jshint");
	grunt.loadNpmTasks("grunt-contrib-uglify");
	grunt.loadNpmTasks("grunt-contrib-watch");
	grunt.loadNpmTasks('grunt-contrib-cssmin');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-aws');
	grunt.loadNpmTasks('grunt-string-replace');


	grunt.registerTask("build", [ "cssmin", "string-replace", "concat", "uglify"]);
	grunt.registerTask("default", ["jshint", "build"]);

};
