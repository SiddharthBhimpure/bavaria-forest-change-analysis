
// STEP 1: Define Area of Interest (AOI) 

var bavaria = ee.Geometry.Rectangle([11.2, 47.8, 11.8, 48.4]); 
Map.centerObject(bavaria, 10); 
Map.addLayer(bavaria, {color: 'red'}, 'Bavaria AOI'); 


// STEP 2: Load Sentinel-2 Level-2A Dataset 

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED'); 


// STEP 3: Filter by Area and Date 

var s2Filtered = s2 
  .filterBounds(bavaria) 
  .filterDate('2019-01-01', '2023-12-31'); 


// STEP 4: Cloud Mask using SCL 

function maskS2(image) { 
  var scl = image.select('SCL'); 
  var mask = scl.eq(4) 
    .or(scl.eq(5)) 
    .or(scl.eq(6)); 
  return image.updateMask(mask); 
} 
var s2Masked = s2Filtered.map(maskS2); 


// STEP 5: Add NDVI 

function addNDVI(image) { 
  var ndvi = image 
    .normalizedDifference(['B8', 'B4']) 
    .rename('NDVI'); 
  return image.addBands(ndvi); 
} 
var s2NDVI = s2Masked.map(addNDVI); 


// STEP 6: Add EVI 

function addEVI(image) { 
  var evi = image.expression( 
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', { 
      'NIR': image.select('B8').multiply(0.0001), 
      'RED': image.select('B4').multiply(0.0001), 
      'BLUE': image.select('B2').multiply(0.0001) 
    } 
  ).rename('EVI'); 
  return image.addBands(evi); 
} 
var s2EVI = s2NDVI.map(addEVI); 


// STEP 6b: Add BSI 

function addBSI(image) {
  var bsi = image.expression(
    '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))', {
      'SWIR': image.select('B11').multiply(0.0001), // Scaled to 0-1 range
      'RED': image.select('B4').multiply(0.0001),
      'NIR': image.select('B8').multiply(0.0001),
      'BLUE': image.select('B2').multiply(0.0001)
    }
  ).rename('BSI');
  return image.addBands(bsi);
}
var s2Indices = s2EVI.map(addBSI); 


// STEP 7: Summer 2021 Collection 

var summer2021 = s2Indices 
  .filterDate('2021-06-01', '2021-08-31'); 

 
// STEP 8: Median Composite 

var summerComposite = summer2021.median(); 


// STEP 9: Display RGB 

Map.addLayer( 
  summerComposite.clip(bavaria), 
  { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 }, 
  'Summer 2021 RGB' 
); 


// STEP 10: Display NDVI 

Map.addLayer( 
  summerComposite.select('NDVI').clip(bavaria), 
  { min: 0, max: 1, palette: ['brown', 'yellow', 'green', 'darkgreen'] }, 
  'Summer 2021 NDVI' 
); 


// STEP 11: Display EVI 

Map.addLayer( 
  summerComposite.select('EVI').clip(bavaria), 
  { min: 0, max: 1, palette: ['brown', 'yellow', 'green', 'darkgreen'] }, 
  'Summer 2021 EVI' 
);


// STEP 12: Display BSI

Map.addLayer( 
  summerComposite.select('BSI').clip(bavaria), 
  { min: -0.2, max: 0.4, palette: [
  'darkgreen',
  'green',
  'yellow',
  'sandybrown',
  'brown'
] }, 
  'Summer 2021 BSI' 
);



// STEP 13: Select Stable Forest Point


// Dense forest selected using Summer 2021 NDVI composite
var forestPoint = ee.Geometry.Point([11.736039805178699, 47.93342334126962]);

Map.addLayer(forestPoint, {color: 'blue'}, 'Stable Forest Point');



// STEP 14: Build Monthly NDVI Time Series



var years = ee.List.sequence(2019, 2023);


var months = ee.List.sequence(1, 12);


var monthlyNDVI = ee.FeatureCollection(

  years.map(function(year) {

    return months.map(function(month) {

  
      var start = ee.Date.fromYMD(year, month, 1);
      var end = start.advance(1, 'month');

      
      var monthlyComposite = s2Indices
        .filterDate(start, end)
        .median();

      var ndvi = monthlyComposite
        .select('NDVI')
        .reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: forestPoint,
          scale: 10,
          maxPixels: 1e9
        })
        .get('NDVI');

      
      return ee.Feature(null, {
        date: start.format('YYYY-MM'),
        year: year,
        month: month,
        NDVI: ndvi
      });

    });

  }).flatten()

)

.filter(ee.Filter.notNull(['NDVI']));



// STEP 15: Plot Monthly NDVI Time Series


var chart = ui.Chart.feature.byFeature(
  monthlyNDVI,
  'date',
  'NDVI'
)
.setChartType('LineChart')
.setOptions({

  title: 'Monthly NDVI at Stable Forest Point (2019–2023)',

  hAxis: {
    title: 'Date',
    slantedText: true,
    slantedTextAngle: 45
  },

  vAxis: {
    title: 'NDVI',
    viewWindow: {
      min: 0,
      max: 1
    }
  },

  lineWidth: 2,
  pointSize: 4,
  colors: ['#228B22']

});

print(chart);


// STEP 16: Load Hansen Global Forest Change Dataset

var hansen = ee.Image('UMD/hansen/global_forest_change_2023_v1_11');



// STEP 17: Display Tree Cover (Year 2000)

Map.addLayer(
  hansen.select('treecover2000').clip(bavaria),
  {
    min: 0,
    max: 100,
    palette: ['white', 'lightgreen', 'darkgreen']
  },
  'Tree Cover 2000'
);


// STEP 18: Display Forest Loss Year

Map.addLayer(
  hansen.select('lossyear').clip(bavaria),
  {
    min: 1,
    max: 23,
    palette: [
      'yellow',
      'orange',
      'red',
      'purple'
    ]
  },
  'Forest Loss Year'
);


// STEP 19: Find Recent Forest Loss Pixels



var treeCover = hansen.select('treecover2000').gte(60);


var recentLoss = hansen.select('lossyear').gte(20);


var lossPixels = treeCover.and(recentLoss);


Map.addLayer(
  lossPixels.selfMask().clip(bavaria),
  {palette: ['red']},
  'Recent Forest Loss (Candidates)'
);

var lossPoint = ee.Geometry.Point([11.45164, 47.93448]); 
Map.addLayer( lossPoint, {color: 'red'}, 'Confirmed Loss Point' ); 

 
// STEP 20: Function to Build Monthly NDVI Time Series 

function buildMonthlyNDVI(point, label) { 
  return ee.FeatureCollection( 
    years.map(function(year){ 
      return months.map(function(month){ 
        var start = ee.Date.fromYMD(year, month, 1); 
        var end = start.advance(1, 'month'); 
        var monthlyComposite = s2Indices 
          .filterDate(start, end) 
          .median(); 
        var ndvi = monthlyComposite.select('NDVI') 
          .reduceRegion({ 
            reducer: ee.Reducer.mean(), 
            geometry: point, 
            scale: 10, 
            maxPixels: 1e9 
          }) 
          .get('NDVI'); 
       return ee.Feature(null,{

  date: start.format('YYYY-MM'),
  NDVI: ndvi,
  Location: label
});
      }); 
    }).flatten() 
  ).filter(ee.Filter.notNull(['NDVI'])); 
} 


// STEP 21: Generate Both Time Series 

var forestNDVI = buildMonthlyNDVI( forestPoint, 'Healthy Forest' ); 
var lossNDVI = buildMonthlyNDVI( lossPoint, 'Loss Pixel' ); 


// STEP 22: Merge Both Time Series 

var comparison = forestNDVI.merge(lossNDVI);


// STEP 23: Plot Comparison Chart 

var comparisonChart = ui.Chart.feature.groups({ 
  features: comparison, 
  xProperty: 'date', 
  yProperty: 'NDVI', 
  seriesProperty: 'Location' 
}) 
.setChartType('LineChart') 
.setOptions({ 
  title: 'Healthy Forest vs Confirmed Forest Loss', 
  hAxis: { title: 'Date', slantedText: true, slantedTextAngle: 45 }, 
  vAxis: { title: 'NDVI', viewWindow: {min: 0, max: 1} }, 
  lineWidth: 3, 
  pointSize: 4, 
  colors: ['green', 'red'] 
}); 

print(comparisonChart);

