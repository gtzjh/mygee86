/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var guangdong = ee.FeatureCollection("projects/mygee86/assets/guangdong"),
    geometry = 
    /* color: #98ff00 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[111.73131964803211, 24.401561983940656],
          [111.73131964803211, 22.39521050523487],
          [116.04894660115711, 22.39521050523487],
          [116.04894660115711, 24.401561983940656]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var dataset = ee.ImageCollection("MODIS/006/MOD17A2H");
var region = geometry;
Map.centerObject(region, 7);

// Update QA mask
var preprocess = function(img){
  var qa_mask = img.select('Psn_QC').eq(0); // Means good quality
  return img.updateMask(qa_mask);
};

// Early paddy rice: 3.1 "03"
// Later paddy rice: 8.1 "08"
var date_list= [
  "2000-04-01", "2000-07-01",
  "2001-04-01", "2001-07-01",
  "2002-04-01", "2002-07-01",
  ];

function mapDate(date){
  var npp_img = dataset.filterDate(ee.Date(date), ee.Date(date).advance(120, 'day'))
                       .map(function(img){return img.clip(region)})
                       .map(preprocess)
                       .select(['PsnNet'])
                       .sum()
                       .multiply(0.0001);
  /*
  var vis = {
    bands: ['PsnNet'],
    min: 0,
    max: 1,
    palette: ['bbe029', '0a9501', '074b03']
  };
  Map.addLayer(npp_img, vis);
  */
  
  Export.image.toDrive({
      image: npp_img.select("PsnNet"),
      scale: 500,
      crs: "EPSG:4326",
      region: region,
      maxPixels: 1e13,
      fileNamePrefix: date,
      description: date,
      folder: 'NPP'
    });
  return "0";
}

var message = date_list.map(mapDate);
  