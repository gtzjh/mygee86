var region = guangdong.geometry();
Map.centerObject(region, 7);


var mosaicSameDate = function(img_col){
  // Mosaic images in same date
  // Get the unique date
  var dates = img_col.aggregate_array('system:time_start')
                     .map(function(date){return ee.Date(date).format('YYYY-MM-dd')})
                     .distinct();
  var mosaicByDate = function(img_date){
    var date = ee.Date(img_date);
    var start_date = date.advance(-1,'day').format('YYYY-MM-dd');
    var end_date = date.advance(1,'day').format('YYYY-MM-dd');
    var filteredCollection = img_col.filterDate(start_date, end_date);
    var mosaic = filteredCollection.mosaic();
    return mosaic.set('system:time_start', date.format('YYYY-MM-dd')); //.millis()
  };
  var img_col_mosaic = dates.map(mosaicByDate);
  return ee.ImageCollection.fromImages(img_col_mosaic);
};

// Use the band named 'probability' derived from COPERNICUS/S2_CLOUD_PROBABILITY to remove cloud
var maskClouds = function(img){
  var clouds = ee.Image(img.get('cloud_mask')).select('probability');
  var isNotCloud = clouds.lt(30); // The cloud probability value larger than 30 is tagged as cloud
  return img.updateMask(isNotCloud);
};

// Get Sentinel-2 ImageCollection has been preprocessed
var getImgCol = function(start_date, end_date, region){
  // Filter the image collection by date and region, and clip the image to the region
  var s2_img_col = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterDate(start_date, end_date)
    .filterBounds(region)
    .map(function(image){return image.clip(region)});
  
  // Prepare the corresponding cloud mask image collection.
  var cloud_s2_img_col = ee.ImageCollection("COPERNICUS/S2_CLOUD_PROBABILITY")
    .filterDate(start_date, end_date)
    .filterBounds(region)
    .map(function(image){return image.clip(region)});
  
  // Combine the cloud probability image collection to remove cloud
  var S2WithCloudMask = ee.Join.saveFirst('cloud_mask').apply({
    primary: s2_img_col,
    secondary: cloud_s2_img_col,
    condition: ee.Filter.equals({leftField: 'system:index', rightField: 'system:index'})
  });
  var S2CloudMasked = ee.ImageCollection(S2WithCloudMask).map(maskClouds); // Remove the cloud
  // Release the memory
  s2_img_col = null;
  cloud_s2_img_col = null;
  S2WithCloudMask = null;
  
  // Mosaic the images in the same date
  return mosaicSameDate(S2CloudMasked);
};

var calculateIndices = function(img){
  // Define indices and their corresponding bands as a dictionary
  var indices_dict = {
    'NDVI' : ['B8',  'B4'],  // (10m)
    'NDWI' : ['B3',  'B8'],  // (10m)
    'MNDWI': ['B3', 'B11'],  // (20m)
    'NDBI' : ['B11', 'B8']   // (20m)
  };
  
  var result = img;
  for (var index_name in indices_dict) {
    var bands = indices_dict[index_name];
    var index_band = img.normalizedDifference(bands).rename(index_name);
    result = result.addBands(index_band);
  }
  return result;
};

// Calculate the EVI
var calculate_EVI = function(image){
  // EVI: B8, B4, B2 (10m) 记得要除以除以10000!!!!!!!
  // https://kaflekrishna.com.np/blog-detail/enhanced-vegetation-index-evi-sentinel-2-image-google-earth-engine/
  var evi = image.expression(
      '2.5 * (NIR - RED) / (NIR + 6.0 * RED - 7.5 * BLUE + 1)',
      {
        'NIR':image.select('B8').divide(10000),
        'RED':image.select('B4').divide(10000),
        'BLUE':image.select('B2').divide(10000)
      }
    ).rename('EVI');
    var evi_mask = evi.gt(-1).and(evi.lt(1));  // Remove the invalid pixels
    evi = evi.updateMask(evi_mask);
  return image.addBands(evi);
};
////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////
// 不进行分块
var start_date = '2024-01-01';
var end_date = '2024-12-31';

var s2_img_col = getImgCol(start_date, end_date, region);
var annual_EVI = s2_img_col.map(calculateIndices)
                           .select("EVI")
                           .median();

print(annual_EVI);
Map.addLayer(annual_EVI);

// Export to my google drive
Export.image.toDrive({
    image: annual_EVI,
    scale: 10,  // Depending on the image resolution.
    crs: "EPSG:4326",
    region: region,
    maxPixels: 1e13,
    description: 'EVI',
    folder: ''
  });
////////////////////////////////////////////////////////////////////////////////////


/*
// 下面这里是进行分区导出
////////////////////////////////////////////////////////////////////////////////////
function generateGrid(xmin, ymin, xmax, ymax, dx, dy) {
  var xx = ee.List.sequence(xmin, ee.Number(xmax).subtract(0.0001), dx);
  var yy = ee.List.sequence(ymin, ee.Number(ymax).subtract(0.0001), dy);
  
  var cells = xx.map(function(x) {
    return yy.map(function(y) {
      var x1 = ee.Number(x);
      var x2 = ee.Number(x).add(ee.Number(dx));
      var y1 = ee.Number(y);
      var y2 = ee.Number(y).add(ee.Number(dy));
      var coords = ee.List([x1, y1, x2, y2]);
      var rect = ee.Algorithms.GeometryConstructors.Rectangle(coords); 
      return ee.Feature(rect);
    });
  }).flatten(); 

  return ee.FeatureCollection(cells);
}

function GridRegion(roiRegion,xBlock,yBlock){
  //roiRegion: area of interest in the form of geometry
  // compute the coordinates
  var bounds = roiRegion.bounds();
  var coords = ee.List(bounds.coordinates().get(0));
  var xmin = ee.List(coords.get(0)).get(0);
  var ymin = ee.List(coords.get(0)).get(1);
  var xmax = ee.List(coords.get(2)).get(0);
  var ymax = ee.List(coords.get(2)).get(1);
  
  var dx = (ee.Number(xmax).subtract(xmin)).divide(xBlock);
  var dy = (ee.Number(ymax).subtract(ymin)).divide(yBlock);
  
  var grid = generateGrid(xmin, ymin, xmax, ymax, dx, dy);  
  grid = grid.filterBounds(roiRegion); 
  
  return grid;
}

var grid = GridRegion(region, 4, 1).filterBounds(region);
var grid_size = grid.size();
print(grid_size);
var grid_list = grid.toList(grid_size).map(function(k){return ee.FeatureCollection([k])});

var color = {'color':'0000FF','fillColor':'FF000000'};
Map.addLayer(grid.style(color), null, 'Grid');
////////////////////////////////////////////////////////////////////////////////////

for(var i=0; i<4; i++){
  var start_date = '2022-01-01';
  var end_date = '2022-12-31';
  var sub_region = ee.FeatureCollection(grid_list.get(i)).first().geometry();
  
  var s2_img_col = getImgCol(start_date, end_date, sub_region);
  var annual_EVI = s2_img_col.map(calculateIndices).select("EVI").median();
  
  print(annual_EVI);
  Map.addLayer(annual_EVI);
  
  // Export to my google drive
  Export.image.toDrive({
      image: annual_EVI,
      scale: 10,  // Depending on the image resolution.
      crs: "EPSG:4326",
      region: sub_region,
      maxPixels: 1e13,
      description: 'EVI',
      folder: ''
    });
}
*/