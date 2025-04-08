var geometry = 
    /* color: #b5d8ff */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[112.93172833931804, 23.95447494427696],
          [112.93172833931804, 22.525466265985827],
          [114.05782697213054, 22.525466265985827],
          [114.05782697213054, 23.95447494427696]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//主成分分析函数
var getPrincipalComponents = function(centered, scale, region) {
    // 图像波段重命名函数
    var getNewBandNames = function(prefix){
        var seq = ee.List.sequence(1, bandNames.length());
        return seq.map(function(b){
          return ee.String(prefix).cat(ee.Number(b).int());
        });
      };
  
    // 图像转为一维数组
    var arrays = centered.toArray();

    // 计算相关系数矩阵
    var covar = arrays.reduceRegion({
      reducer: ee.Reducer.centeredCovariance(),
      geometry: region,
      scale: scale,
      maxPixels: 10e9
    });

    // 获取“数组”协方差结果并转换为数组。
    // 波段与波段之间的协方差
    var covarArray = ee.Array(covar.get('array'));

    // 执行特征分析，并分割值和向量。
    var eigens = covarArray.eigen();

    // 特征值的P向量长度
    var eigenValues = eigens.slice(1, 0, 1);
   
    //计算主成分载荷
    var eigenValuesList = eigenValues.toList().flatten()
    var total = eigenValuesList.reduce(ee.Reducer.sum())
    var percentageVariance = eigenValuesList.map(function(item) {
      return (ee.Number(item).divide(total)).multiply(100).format('%.2f')
    })
    // print(eigenValues ,'特征值')
    // print("特征贡献率", percentageVariance)  

    // PxP矩阵，其特征向量为行。
    var eigenVectors = eigens.slice(1, 1);
    // print('eigenVectors 特征向量',eigenVectors)
    // 将图像转换为二维阵列
    var arrayImage = arrays.toArray(1);

    //使用特征向量矩阵左乘图像阵列
    var principalComponents = ee.Image(eigenVectors).matrixMultiply(arrayImage);

    // 将特征值的平方根转换为P波段图像。
    var sdImage = ee.Image(eigenValues.sqrt())
      .arrayProject([0]).arrayFlatten([getNewBandNames('sd')]);

    //将PC转换为P波段图像，通过SD标准化。
    principalComponents=principalComponents
      // 抛出一个不需要的维度，[[]]->[]。
      .arrayProject([0])
      // 使单波段阵列映像成为多波段映像，[]->image。
      .arrayFlatten([getNewBandNames('pc')])
      // 通过SDs使PC正常化。
      .divide(sdImage);
    return principalComponents
  };


//归一化函数
var img_normalize = function(input_img){
      var minMax = input_img.reduceRegion({
            reducer:ee.Reducer.minMax(),
            geometry: roi,
            scale: 100,
            maxPixels: 10e13,
            tileScale: 16
        });
      var year = input_img.get('year');
      var normalize  = ee.ImageCollection.fromImages(
            input_img.bandNames().map(function(name){
                  name = ee.String(name);
                  var band = input_img.select(name);
                  return band.unitScale(ee.Number(minMax.get(name.cat('_min'))), ee.Number(minMax.get(name.cat('_max'))));
              })
        ).toBands().rename(input_img.bandNames());
    return normalize;
};


// 去云函数
function removeCloud(image){
  var qa = image.select('QA_RADSAT')
  var cloudMask = qa.bitwiseAnd(1 << 4).eq(0)
  var cloudShadowMask = qa.bitwiseAnd(1 << 8).eq(0)
  var valid = cloudMask.and(cloudShadowMask)
  return image.updateMask(valid)
}

//导入自己的研究区，将其定义为roi
var roi = geometry
var syear= '2023' //定义年
var star_date = '2023-08-01' //定义起始时间
var end_date = '2023-10-31' //定义终止时间


// Select image collection
var img_SR = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA")
            .filterBounds(roi)
            .filterDate(star_date, end_date)
            .filterMetadata('CLOUD_COVER', 'less_than', 30)
            .map(removeCloud)
            .median()
print(img_SR)


//////////////////////////////////////////////////////////////////////////////////////////////
//LST计算
var Emissivity = function(image, nir, red, min, max, de) {
  min = min || 0.2
  max = max || 0.5
  de = de || 0.005
  var ndvi_e = "(nir-red)/(nir+red)"
  var ndvi =  ee.Image(0).expression(ndvi_e, {'nir': image.select(nir), 'red': image.select(red)}).rename('ndvi')
  var pv = ee.Image(0).expression("((ndvi-min)/(max-min))**2", {ndvi: ndvi, min: min, max: max})
  var exp = "ndvi < 0.2 ? 0.979 - (0.046 * b4) : 0.2 <= ndvi <= 0.5 ? (0.987 * pv) + 0.971 * (1 - pv) + de : 0.987 + de"
  return ee.Image(0).expression(exp, {ndvi: ndvi, b4: image.select(red).multiply(0.0001), pv: pv, de: de}).rename('EM')
}

var images = img_SR
var thermal = images.select('B10').multiply(0.1)
var EMM = Emissivity(img_SR, 'B5', 'B4').clip(roi);

var LST = thermal.expression(
    '(Tb/(1 + (0.0010904 * (Tb / 1.438))*log(Ep)))-273.15', {
    'Tb': thermal.select('B10'),
    'Ep': EMM.select('EM'),
});
LST = img_normalize(LST)
images = images.addBands(LST.rename('LST').toFloat())
var SR_LST= images.select('LST')
//////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////
//计算NDVI
var ndvi = img_SR.normalizedDifference(['B5', 'B4']);
img_SR = img_SR.addBands(ndvi.rename('NDVI'))
//////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////
//计算WET
var Wet = img_SR.expression('B*(0.1509) + G*(0.1973) + R*(0.3279) + NIR*(0.3406) + SWIR1*(-0.7112) + SWIR2*(-0.4572)',{
       'B': img_SR.select(['B2']),
       'G': img_SR.select(['B3']),
       'R': img_SR.select(['B4']),
       'NIR': img_SR.select(['B5']),
       'SWIR1': img_SR.select(['B6']),
       'SWIR2': img_SR.select(['B7'])
     })
  Wet = img_normalize(Wet)
  img_SR = img_SR.addBands(Wet.rename('WET').toFloat())
//////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////  
//计算NDBSI
var ibi = img_SR.expression('(2 * SWIR1 / (SWIR1 + NIR) - (NIR / (NIR + RED) + GREEN / (GREEN + SWIR1))) / (2 * SWIR1 / (SWIR1 + NIR) + (NIR / (NIR + RED) + GREEN / (GREEN + SWIR1)))', {
    'SWIR1': img_SR.select('B6'),
    'NIR': img_SR.select('B5'),
    'RED': img_SR.select('B4'),
    'GREEN': img_SR.select('B3')
  });
var si = img_SR.expression('((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))', {
    'SWIR1': img_SR.select('B6'),
    'NIR': img_SR.select('B5'),
    'RED': img_SR.select('B4'),
    'BLUE': img_SR.select('B2')
  })
var ndbsi = (ibi.add(si)).divide(2)
ndbsi= img_normalize(ndbsi)
img_SR = img_SR.addBands(ndbsi.rename('NDBSI'))
//////////////////////////////////////////////////////////////////////////////////////////////


// Combine
var Gross_IMGS = img_SR.addBands(SR_LST).select(["WET","NDVI","NDBSI","LST"])
print(Gross_IMGS)


//////////////////////////////////////////////////////////////////////////////////////////////
//进行主成分分析，获得分析结果
var scale = 100;
var region = roi;
var bandNames = Gross_IMGS.bandNames();
var PCA_image =  Gross_IMGS.select(["WET","NDVI","NDBSI","LST"]);

var meanDict = PCA_image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region,
    scale: scale,
    maxPixels: 10e9
});
var means = ee.Image.constant(meanDict.values(bandNames));
var centered = PCA_image.subtract(means);
var pcImage = getPrincipalComponents(centered, scale, region);
//////////////////////////////////////////////////////////////////////////////////////////////


//RESI
var img_SR = img_SR.addBands(ee.Image(1).rename('constant'))
var rsei0 = img_SR.expression('pc1',{
    constant: img_SR.select('constant'),
    pc1: pcImage.select('pc1')
  })

//In order to apply the following pixel dichotomy procedure to conditionally normalize, temporarily unify the band names
var rsei0 = rsei0.rename("Norm")

//Pixel binary model
function calNorm(Norm,region,scale){
    var num = Norm.reduceRegion({
      reducer:ee.Reducer.percentile([1,99]),
      geometry:roi,
      scale:30,
      maxPixels:10e13
    });
    var low = ee.Number(num.get("Norm_p1"));
    var high = ee.Number(num.get("Norm_p99"));
    //累加概率Accpct大于99%的部分视为设置成最高值1，小于1%的部分设置成最低值0 中间部分为1%-99%
    var great99AccpctPart = Norm.gt(high);
    var less1AccpctPart = Norm.lt(low);
    var Accpct1_99Part = ee.Image(1).subtract(great99AccpctPart)
                                    .subtract(less1AccpctPart);
    var Stretching_formula = Norm.subtract(low).divide(high.subtract(low));
    var Normaaa = ee.Image(1).multiply(great99AccpctPart)
                         .add(ee.Image(0).multiply(less1AccpctPart))
                         .add(Stretching_formula.multiply(Accpct1_99Part))
  return Normaaa;
}



//////////////////////////////////////////////////////////////////////////////////////////////
var rsei = calNorm(rsei0, roi, 30);
var result = Gross_IMGS.addBands(rsei.rename('rsei'))




//使用JRC Yearly Water Classification History进行水体掩膜/Use JRC Yearly Water Classification History for water mask
//JRC年度水分类历史-30m
//0    cccccc    No data
//1    ffffff    Not water
//2    99d9ea    Seasonal water
//3    0000ff    Permanent water
var Water_JRC = ee.ImageCollection('JRC/GSW1_3/YearlyHistory')
             .filterDate('2020-01-01', '2020-12-31')
             .filterBounds(roi)
             .select('waterClass')
             .toBands()
             .clip(roi)
var mask0 = Water_JRC.eq(2);
var mask1 = Water_JRC.eq(3);
var mask_con = mask1.add(mask0).unmask().eq(0);

//空值设置成0，以确保图像不出现空值
var L8_composite_ummask = result.unmask(0).clip(roi)
var L8_waterMask = L8_composite_ummask.updateMask(mask_con)
var Histogram_of_RSEI_Norm = ui.Chart.image.histogram(L8_waterMask.select(["rsei"]),roi, 100)
var visParam = {
    palette:
    'FFFFFF, CE7E45, DF923D, F1B555, FCD163, 99B718, 74A901, 66A000, 529400,' +
    '3E8601, 207401, 056201, 004C00, 023B01, 012E01, 011D01, 011301'
};


Map.addLayer(L8_waterMask.select('rsei').clip(roi), visParam, 'rseim');

Export.image.toDrive({
   image: L8_waterMask.select(["rsei"]),
   description: syear+'rsei',
   scale: 30,
   region:roi,
   fileFormat: 'GeoTIFF',
   maxPixels: 800000000,
 });