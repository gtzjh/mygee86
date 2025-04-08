/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var country = ee.FeatureCollection("projects/mygee86/assets/country"),
    geometry = 
    /* color: #d63000 */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[111.99499152303211, 24.826053317435385],
          [111.99499152303211, 21.820123133535162],
          [115.45568488240711, 21.820123133535162],
          [115.45568488240711, 24.826053317435385]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var dataset = ee.ImageCollection("MODIS/006/MOD17A2H");  // The 006 product has been , but the newer (061) doesn's have data from 2000-2020.
var dataset2 = ee.ImageCollection("MODIS/061/MOD17A2H");
var data = dataset2;
var region = geometry;  // Draw by myself.
Map.centerObject(region, 4);


var year = "2001";

for(var i=0; i<12; i++){
  var start_date = ee.Date(ee.String(year).cat("-01-01").advance(i, "month"));
  var GPP = data.filterDate(start_date, start_date.advance(1, "month"))
                   .sum()
                   .multiply(0.0001);
  
  /*
  var GPP_vis = {
    min: 0.0,
    max: 0.3,
    palette: ['bbe029', '0a9 501', '074b03'],
  };
  Map.addLayer(GPP, GPP_vis);
  */ 
  // print(GPP);
  
  var month = i + 1;
  
  Export.image.toDrive({
      image: GPP.select("Gpp"),
      scale: 500,
      crs: "EPSG:4326",
      region: region,
      maxPixels: 1e13,
      folder: "GPP",
      fileNamePrefix: year + "_" + month,
      description: year + "_" + month
    });
}
