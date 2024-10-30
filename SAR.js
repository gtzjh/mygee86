/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = 
    /* color: #d63000 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[112.38170815102107, 23.33056072851231],
          [112.38170815102107, 22.915045477936356],
          [112.84862709633357, 22.915045477936356],
          [112.84862709633357, 23.33056072851231]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
Map.centerObject(geometry, 11);


var wrapper = require('users/adugnagirma/gee_s1_ard:wrapper');
var helper = require('users/adugnagirma/gee_s1_ard:utilities');


var parameter = {//1. Data Selection
              START_DATE: "2018-01-01",
              STOP_DATE: "2018-01-31",
              POLARIZATION:'VVVH',
              ORBIT : 'BOTH',
              GEOMETRY: geometry, //uncomment if interactively selecting a region of interest
              //GEOMETRY: ee.Geometry.Polygon([[[104.80, 11.61],[104.80, 11.36],[105.16, 11.36],[105.16, 11.61]]], null, false), //Uncomment if providing coordinates
              //GEOMETRY: ee.Geometry.Polygon([[[112.05, -0.25],[112.05, -0.45],[112.25, -0.45],[112.25, -0.25]]], null, false),
              //2. Additional Border noise correction
              APPLY_ADDITIONAL_BORDER_NOISE_CORRECTION: true,
              //3.Speckle filter
              APPLY_SPECKLE_FILTERING: true,
              SPECKLE_FILTER_FRAMEWORK: 'MULTI',
              SPECKLE_FILTER: 'BOXCAR',
              SPECKLE_FILTER_KERNEL_SIZE: 15,
              SPECKLE_FILTER_NR_OF_IMAGES: 10,
              //4. Radiometric terrain normalization
              APPLY_TERRAIN_FLATTENING: true,
              DEM: ee.Image('USGS/SRTMGL1_003'),
              TERRAIN_FLATTENING_MODEL: 'VOLUME',
              TERRAIN_FLATTENING_ADDITIONAL_LAYOVER_SHADOW_BUFFER: 0,
              //5. Output
              FORMAT : 'DB',
              CLIP_TO_ROI: true,
              SAVE_ASSETS: false
}

//Preprocess the S1 collection
var s1_preprocces = wrapper.s1_preproc(parameter);
var s1_preprocces = s1_preprocces[1].map(helper.lin_to_db);



// var s1 = s1_preprocces[0];
Map.addLayer(s1_preprocces.first().select('VH'), {min:-25, max:-5});
print(s1_preprocces.first().select('VH'));


//Visulaization of the first image in the collection in RGB for VV, VH, images
var visparam = {}
if (parameter.POLARIZATION=='VVVH'){
     if (parameter.FORMAT=='DB'){
    var s1_preprocces_view = s1_preprocces.map(helper.add_ratio_lin).map(helper.lin_to_db2);
    var s1_view = s1.map(helper.add_ratio_lin).map(helper.lin_to_db2);
    visparam = {bands:['VV','VH','VVVH_ratio'],min: [-20, -25, 1],max: [0, -5, 15]}
    }
    else {
    var s1_preprocces_view = s1_preprocces.map(helper.add_ratio_lin);
    var s1_view = s1.map(helper.add_ratio_lin);
    visparam = {bands:['VV','VH','VVVH_ratio'], min: [0.01, 0.0032, 1.25],max: [1, 0.31, 31.62]}
    }
}
else {
    if (parameter.FORMAT=='DB') {
    s1_preprocces_view = s1_preprocces.map(helper.lin_to_db);
    s1_view = s1.map(helper.lin_to_db);
    visparam = {bands:[parameter.POLARIZATION],min: -25,max: 0}   
    }
    else {
    s1_preprocces_view = s1_preprocces;
    s1_view = s1;
    visparam = {bands:[parameter.POLARIZATION],min: 0,max: 0.2}
    }
}

// Map.addLayer(s1_view.first(), visparam, 'First image in the input S1 collection', true);
// Map.addLayer(s1_preprocces_view.first(), visparam, 'First image in the processed S1 collection', true);
// print(s1_preprocces_view);
