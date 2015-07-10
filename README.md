# Clinician Autocomplete

Our widget provides rich text searching and geolocation. So you can pre-fill long signup forms and reduce user drop off.

![alt text](https://github.com/bloomapi/clinician-autocomplete/raw/master/autocomplete_demo.gif "Autocomplete Demo")

## Demo
See a demo [here](https://www.bloomapi.com/products/clinician-identity/autocomplete-demo)

## Quickstart

####1. Signup
Get a free developer api key at [BloomAPI](https://www.bloomapi.com/signup)

####2. Embed Widget
Add the autocomplete.js from our CDN (or serve it locally)
```html
<script type="text/javascript" src="https://cdn.bloomapi.com/assets/js/autocomplete-0.0.2.min.js"></script>
```

Add the text input to your application:
```html
<input id="autocomplete" type="text" placeholder="Search Clinicians ...">
```
Setup the autocomplete javascript:
<br>
```javascript
  var autocomplete = new Autocomplete((document.getElementById("autocomplete")), {
    apiKey: "[API Key]", //replace this with your BloomAPI key.
    distance: 25
  }).on("select", function(ev, selected){
  // Replace next line with code to communicated selected person to your application
  console.log(selected.npi);
  });
```

