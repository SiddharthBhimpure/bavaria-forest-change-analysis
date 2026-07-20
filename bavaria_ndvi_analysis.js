// ======================================================
// STEP 1: Define Area of Interest (AOI) 
// ======================================================
var bavaria = ee.Geometry.Rectangle([11.2, 47.8, 11.8, 48.4]); 
Map.centerObject(bavaria, 10); 
Map.addLayer(bavaria, {color: 'red'}, 'Bavaria AOI'); 


// ======================================================
// STEP 2 & 3: Load & Filter Collections
// ======================================================
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED'); 
var s2Filtered = s2 
  .filterBounds(bavaria) 
  .filterDate('2019-01-01', '2023-12-31'); 


// ======================================================
// STEP 4, 5, 6, 6b: Cloud Masking & Indices Calculations
// ======================================================
function maskS2(image) { 
  var scl = image.select('SCL'); 
  var mask = scl.eq(4).or(scl.eq(5)).or(scl.eq(6)); 
  return image.updateMask(mask); 
} 
var s2Masked = s2Filtered.map(maskS2); 

function addNDVI(image) { 
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI'); 
  return image.addBands(ndvi); 
} 
var s2NDVI = s2Masked.map(addNDVI); 

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

function addBSI(image) {
  var bsi = image.expression(
    '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))', {
      'SWIR': image.select('B11').multiply(0.0001), 
      'RED': image.select('B4').multiply(0.0001),
      'NIR': image.select('B8').multiply(0.0001),
      'BLUE': image.select('B2').multiply(0.0001)
    }
  ).rename('BSI');
  return image.addBands(bsi);
}
var s2Indices = s2EVI.map(addBSI); 


// ======================================================
// STEP 7 to 12: Visualizing Maps (Summer 2021)
// ======================================================
var summer2021 = s2Indices.filterDate('2021-06-01', '2021-08-31'); 
var summerComposite = summer2021.median(); 

Map.addLayer(summerComposite.clip(bavaria), { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 }, 'Summer 2021 RGB'); 
Map.addLayer(summerComposite.select('NDVI').clip(bavaria), { min: 0, max: 1, palette: ['brown', 'yellow', 'green', 'darkgreen'] }, 'Summer 2021 NDVI'); 
Map.addLayer(summerComposite.select('EVI').clip(bavaria), { min: 0, max: 1, palette: ['brown', 'yellow', 'green', 'darkgreen'] }, 'Summer 2021 EVI'); 
Map.addLayer(summerComposite.select('BSI').clip(bavaria), { min: -0.2, max: 0.4, palette: ['darkgreen', 'green', 'yellow', 'sandybrown', 'brown'] }, 'Summer 2021 BSI'); 


// ======================================================
// STEP 13: Select Stable Forest Point
// ======================================================
var forestPoint = ee.Geometry.Point([11.736039805178699, 47.93342334126962]);
Map.addLayer(forestPoint, {color: 'blue'}, 'Stable Forest Point');


// ======================================================
// STEP 14: Build Monthly NDVI Time Series (Baseline Extraction Engine)
// ======================================================
var years = ee.List.sequence(2019, 2023);
var months = ee.List.sequence(1, 12);

var monthlyNDVI = ee.FeatureCollection(
  years.map(function(year) {
    return months.map(function(month) {
      var start = ee.Date.fromYMD(year, month, 1);
      var end = start.advance(1, 'month');
      
      var monthlyComposite = s2Indices.filterDate(start, end).median();
      var ndvi = monthlyComposite.select('NDVI').reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: forestPoint,
        scale: 10,
        maxPixels: 1e9
      }).get('NDVI');

      return ee.Feature(null, {
        date: start.format('yyyy-MM'), // Lowercase 'yyyy' for safety standard compliance
        year: year,
        month: month,
        NDVI: ndvi,
        Location: 'Healthy Forest' // Crucial addition to make step 22/23 cross-compatible
      });
    });
  }).flatten()
).filter(ee.Filter.notNull(['NDVI']));


// ======================================================
// STEP 15: Plot Monthly NDVI Time Series (Healthy Forest Baseline)
// ======================================================
var chart = ui.Chart.feature.byFeature(monthlyNDVI, 'date', 'NDVI')
  .setChartType('LineChart')
  .setOptions({
    title: 'Monthly NDVI at Stable Forest Point (2019–2023)',
    hAxis: { title: 'Date', slantedText: true, slantedTextAngle: 45 },
    vAxis: { title: 'NDVI', viewWindow: { min: 0, max: 1 } },
    lineWidth: 2,
    pointSize: 4,
    colors: ['#228B22']
  });
print(chart);


// ======================================================
// STEP 16 to 18: Load & Display Hansen Global Forest Change
// ======================================================
var hansen = ee.Image('UMD/hansen/global_forest_change_2023_v1_11');

Map.addLayer(hansen.select('treecover2000').clip(bavaria), {
  min: 0, max: 100, palette: ['white', 'lightgreen', 'darkgreen']
}, 'Tree Cover 2000');

Map.addLayer(hansen.select('lossyear').clip(bavaria), {
  min: 1, max: 23, palette: ['yellow', 'orange', 'red', 'purple']
}, 'Forest Loss Year');


// ======================================================
// STEP 19: Find Recent Forest Loss Pixels
// ======================================================
var treeCover = hansen.select('treecover2000').gte(60);
var recentLoss = hansen.select('lossyear').gte(20);
var lossPixels = treeCover.and(recentLoss);

Map.addLayer(lossPixels.selfMask().clip(bavaria), {palette: ['red']}, 'Recent Forest Loss (Candidates)');

var lossPoint = ee.Geometry.Point([11.45164, 47.93448]); 
Map.addLayer(lossPoint, {color: 'red'}, 'Confirmed Loss Point'); 

 
// ======================================================
// STEP 20: Reusable Function to Build Standardized Monthly NDVI
// ======================================================
function buildMonthlyNDVI(point, label) {

  return ee.FeatureCollection(

    years.map(function(year) {

      return months.map(function(month) {

        var start = ee.Date.fromYMD(year, month, 1);
        var end = start.advance(1, 'month');

        var monthlyComposite =
            s2Indices
              .filterDate(start, end)
              .median();

        var ndvi =
            monthlyComposite
              .select('NDVI')
              .reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: point,
                scale: 10,
                maxPixels: 1e9
              })
              .get('NDVI');

        return ee.Feature(null,{

          date: start.format('yyyy-MM'),

          year: year,

          month: month,

          NDVI: ndvi,

          Location: label

        });

      });

    }).flatten()

  )
  .filter(ee.Filter.notNull(['NDVI']));

}
// ======================================================
// STEP 21 & 22: Generate & Merge Time Series 
// ======================================================
var forestNDVI = buildMonthlyNDVI(forestPoint, 'Healthy Forest'); 
var lossNDVI = buildMonthlyNDVI(lossPoint, 'Loss Pixel'); 
var comparison = forestNDVI.merge(lossNDVI);


// ======================================================
// STEP 23: Plot Comparison Chart (Healthy vs Single Loss Point)
// ======================================================
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


// ======================================================
// TASK 1 - HANSEN LOSS PIXEL STRATIFICATION 
// ======================================================
var treecover = hansen.select('treecover2000');
var lossyear = hansen.select('lossyear');

var denseCandidates = treecover.gte(80).and(treecover.lte(100)).and(lossyear.gte(20));
var mediumCandidates = treecover.gte(60).and(treecover.lte(79)).and(lossyear.gte(20));
var sparseCandidates = treecover.gte(40).and(treecover.lte(59)).and(lossyear.gte(20));
var verySparseCandidates = treecover.gte(20).and(treecover.lte(39)).and(lossyear.gte(20));
    
Map.addLayer(denseCandidates.selfMask().clip(bavaria), {palette: ['darkgreen']}, 'Dense Candidates (80-100)');
Map.addLayer(mediumCandidates.selfMask().clip(bavaria), {palette: ['yellow']}, 'Medium Candidates (60-79)');
Map.addLayer(sparseCandidates.selfMask().clip(bavaria), {palette: ['orange']}, 'Sparse Candidates (40-59)');
Map.addLayer(verySparseCandidates.selfMask().clip(bavaria), {palette: ['red']}, 'Very Sparse Candidates (20-39)');


// ======================================================
// TASK 1 - Define Stratified Sample Pixels
// ======================================================
var densePoint1 = ee.Geometry.Point([11.4376, 48.0569]);
var densePoint2 = ee.Geometry.Point([11.62360, 47.98457]);
var mediumPoint = ee.Geometry.Point([11.29928, 48.04259]);
var sparsePoint = ee.Geometry.Point([11.448847, 48.015903]);
var verySparsePoint = ee.Geometry.Point([11.604945, 47.873129]);

Map.addLayer(densePoint1, {color:'brown'}, 'Dense 1');
Map.addLayer(densePoint2, {color:'orange'}, 'Dense 2');
Map.addLayer(mediumPoint, {color:'yellow'}, 'Medium');
Map.addLayer(sparsePoint, {color:'cyan'}, 'Sparse');
Map.addLayer(verySparsePoint, {color:'white'}, 'Very Sparse');


// ======================================================
// TASK 1 - Extract Stratified Time Series Collections
// ======================================================
var denseNDVI1 = buildMonthlyNDVI(densePoint1, 'Dense 1');
var denseNDVI2 = buildMonthlyNDVI(densePoint2, 'Dense 2');
var mediumNDVI = buildMonthlyNDVI(mediumPoint, 'Medium');
var sparseNDVI = buildMonthlyNDVI(sparsePoint, 'Sparse');
var verySparseNDVI = buildMonthlyNDVI(verySparsePoint, 'Very Sparse');


// ======================================================
// TASK 1: Reusable Standard NDVI Chart Function & Execution
// ======================================================
function printNDVIChart(featureCollection, title) {
  var chart = ui.Chart.feature.byFeature(featureCollection, 'date', 'NDVI')
  .setChartType('LineChart')
  .setOptions({
    title: title,
    hAxis: { title: 'Date', slantedText: true, slantedTextAngle: 45 },
    vAxis: { title: 'NDVI', viewWindow: {min: 0, max: 1} },
    lineWidth: 3, pointSize: 4, colors: ['forestgreen']
  });
  print(chart);
}

printNDVIChart(denseNDVI1, 'Dense Forest (80–100%)');
printNDVIChart(denseNDVI2, 'Dense Forest 2 (80–100%)');
printNDVIChart(mediumNDVI, 'Medium Forest (60–79%)');
printNDVIChart(sparseNDVI, 'Sparse Forest (40–59%)');
printNDVIChart(verySparseNDVI, 'Very Sparse Forest (20–39%)');


// ======================================================
// TASK 2 - SENTINEL-1 BACKSCATTER ANALYSIS
// ======================================================
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(bavaria)
  .filterDate('2019-01-01', '2023-12-31')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));


// ======================================================
// TASK 2: Build Monthly Sentinel-1 (VH and VV) Extractor
// ======================================================
function buildMonthlyS1(point, label) {
  return ee.FeatureCollection(
    years.map(function(year) {
      return months.map(function(month) {
        var start = ee.Date.fromYMD(year, month, 1);
        var end = start.advance(1, 'month');

        var image = s1.filterDate(start, end).median();
        var stats = image.reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: point,
          scale: 10,
          bestEffort: true
        });

        return ee.Feature(null, {
          date: start.format('yyyy-MM'), // Perfectly matches S2 string format
          VH: stats.get('VH'),
          VV: stats.get('VV'),
          Location: label
        });
      });
    }).flatten()
  ).filter(ee.Filter.notNull(['VH', 'VV']));
}


// ======================================================
// TASK 2: Execute Radar Metric Extraction Across All Points
// ======================================================
var healthyS1    = buildMonthlyS1(forestPoint, 'Healthy Forest');
var denseS1_1     = buildMonthlyS1(densePoint1, 'Dense 1');
var denseS1_2     = buildMonthlyS1(densePoint2, 'Dense 2');
var mediumS1      = buildMonthlyS1(mediumPoint, 'Medium');
var sparseS1      = buildMonthlyS1(sparsePoint, 'Sparse');
var verySparseS1  = buildMonthlyS1(verySparsePoint, 'Very Sparse');

print("Sample Healthy S1 Metadata:", healthyS1.limit(5)); // Restored validation check


// ======================================================
// TASK 2: Long Format Standardization Engines
// ======================================================
function standardizeCollection(fc, valueProperty, variableName) {
  return fc.map(function(feature){
    return ee.Feature(null, {
      date: feature.get('date'),
      Value: feature.get(valueProperty),
      Variable: variableName,
      Location: feature.get('Location')
    });
  });
}

var dense1NDVI_std      = standardizeCollection(denseNDVI1, 'NDVI', 'NDVI');
var dense2NDVI_std      = standardizeCollection(denseNDVI2, 'NDVI', 'NDVI');
var mediumNDVI_std      = standardizeCollection(mediumNDVI, 'NDVI', 'NDVI');
var sparseNDVI_std      = standardizeCollection(sparseNDVI, 'NDVI', 'NDVI');
var verySparseNDVI_std  = standardizeCollection(verySparseNDVI, 'NDVI', 'NDVI');
var healthyNDVI_std     = standardizeCollection(monthlyNDVI, 'NDVI', 'NDVI');

var dense1VH_std        = standardizeCollection(denseS1_1, 'VH', 'VH');
var dense2VH_std        = standardizeCollection(denseS1_2, 'VH', 'VH');
var mediumVH_std        = standardizeCollection(mediumS1, 'VH', 'VH');
var sparseVH_std        = standardizeCollection(sparseS1, 'VH', 'VH');
var verySparseVH_std    = standardizeCollection(verySparseS1, 'VH', 'VH');
var healthyVH_std       = standardizeCollection(healthyS1, 'VH', 'VH');


// ======================================================
// TASK 2: Final Feature Combination Merges
// ======================================================
var healthyCombined    = healthyNDVI_std.merge(healthyVH_std);
var dense1Combined     = dense1NDVI_std.merge(dense1VH_std);
var dense2Combined     = dense2NDVI_std.merge(dense2VH_std);
var mediumCombined     = mediumNDVI_std.merge(mediumVH_std);
var sparseCombined     = sparseNDVI_std.merge(sparseVH_std);
var verySparseCombined = verySparseNDVI_std.merge(verySparseVH_std);
 



// ======================================================
// TASK 2 : Dual Axis NDVI vs VH Comparison Chart Constructor
// ======================================================
function printComparisonChart(featureCollection, title) {
  var chart = ui.Chart.feature.groups({
    features: featureCollection,
    xProperty: 'date',
    yProperty: 'Value',
    seriesProperty: 'Variable'
  })
  .setChartType('LineChart')
  .setOptions({
    title: title,
    lineWidth: 3,
    pointSize: 4,
    hAxis: { title: 'Timeline', slantedText: true, slantedTextAngle: 45 },
    series: {
      0: {targetAxisIndex: 0, color: '#1b9e77'}, // Green Line for NDVI
      1: {targetAxisIndex: 1, color: '#d95f02'}  // Orange Line for Radar Backscatter
    },
    vAxes: {
      0: { title: 'NDVI (Optical)', viewWindow: {min: 0, max: 1}, titleTextStyle: {color: '#1b9e77'}, textStyle: {color: '#1b9e77'} },
      1: { title: 'VH Backscatter (dB - Radar)', titleTextStyle: {color: '#d95f02'}, textStyle: {color: '#d95f02'} }
    },
    legend: {position: 'bottom'}
  });

  print(chart);
}


// ======================================================
// Generate All Final Dual Axis Comparison Charts
// ======================================================
printComparisonChart(healthyCombined, 'Healthy Forest : NDVI vs VH');
printComparisonChart(dense1Combined, 'Dense Forest 1 : NDVI vs VH');
printComparisonChart(dense2Combined, 'Dense Forest 2 : NDVI vs VH');
printComparisonChart(mediumCombined, 'Medium Forest : NDVI vs VH');
printComparisonChart(sparseCombined, 'Sparse Forest : NDVI vs VH');
printComparisonChart(verySparseCombined, 'Very Sparse Forest : NDVI vs VH');










// ======================================================
// TASK 3: COMPLETE MONTHLY CLIMATOLOGY & RESIDUAL NDVI
// ======================================================

// ------------------------------------------------------
// STEP 1A: Compute Monthly Climatology Baseline Collection
// ------------------------------------------------------
var monthlyClimatology = ee.FeatureCollection(
  months.map(function(month){
    month = ee.Number(month);

    var monthData = monthlyNDVI.filter(
      ee.Filter.eq('month', month)
    );

    var meanNDVI = ee.Number(monthData.aggregate_mean('NDVI'));

    return ee.Feature(null, {
      'Month': month,
      'Mean_NDVI': meanNDVI
    });
  })
);

print('Monthly NDVI Climatology Baseline Collection:', monthlyClimatology);

// Render Climatology Baseline Chart
var climatologyChart = ui.Chart.feature.byFeature(
    monthlyClimatology,
    'Month',
    'Mean_NDVI'
)
.setChartType('LineChart')
.setOptions({
    title: 'Healthy Forest Monthly NDVI Climatology Baseline',
    hAxis: {
      title: 'Month (1-12)',
      ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    },
    vAxis: {
      title: 'Average Baseline NDVI'
    },
    lineWidth: 3,
    pointSize: 5,
    colors: ['forestgreen']
});

print(climatologyChart);

// ------------------------------------------------------
// STEP 1B: Convert Monthly Climatology Collection to Dictionary (Lookup Table)
// ------------------------------------------------------
var climatologyDict = ee.Dictionary(
  monthlyClimatology.iterate(function(feature, dict) {
    feature = ee.Feature(feature);
    dict = ee.Dictionary(dict);

    return dict.set(
      ee.Number(feature.get('Month')).format(),
      feature.get('Mean_NDVI')
    );
  }, ee.Dictionary({}))
);

print(climatologyDict);


// ------------------------------------------------------
// STEP 2: Reusable Residual Calculation Function 
// ------------------------------------------------------

function computeResidualSeries(featureCollection, locationName) {

  return featureCollection.map(function(feature) { 
    // Read the raw fields safely
    var rawMonth = feature.get('month');
    var actualNDVI = feature.get('NDVI'); 
    
    // Set up standard default fallbacks for missing months
    var monthString = ee.String(ee.Algorithms.If(rawMonth, ee.Number(rawMonth).format('%.1f'), '1.0'));
    
    // Server-side lookup using our dictionary table
    var expectedNDVI = ee.Number(climatologyDict.get(monthString));

    // Inline conditional evaluation to completely eliminate scoping errors
    var residual = ee.Number(
      ee.Algorithms.If(
        actualNDVI, 
        ee.Number(actualNDVI).subtract(expectedNDVI), 
        null
      )
    );

    // Strict schema binding to make sure the properties exist explicitly for the chart engine
    return feature.set({
      'Location': locationName,
      'Expected_NDVI': ee.Algorithms.If(rawMonth, expectedNDVI, null),
      'Residual_NDVI': ee.Algorithms.If(rawMonth, residual, null)
    });
  });
}
// ------------------------------------------------------
// STEP 3: Compute the Residual Collections for Each Pixel
// ------------------------------------------------------
// This takes your raw pixel datasets and pushes them through the formula
var denseResidual1 = computeResidualSeries(denseNDVI1, 'Dense Forest 1');
var denseResidual2 = computeResidualSeries(denseNDVI2, 'Dense Forest 2');
var mediumResidual  = computeResidualSeries(mediumNDVI,  'Medium Forest');
var sparseResidual  = computeResidualSeries(sparseNDVI,  'Sparse Forest');
var verySparseResidual = computeResidualSeries(verySparseNDVI, 'Very Sparse Forest');


// ------------------------------------------------------
// STEP 4: Reusable Residual NDVI Chart Function
// ------------------------------------------------------
function plotResidualChart(featureCollection, title) {

  var chart = ui.Chart.feature.byFeature(
      featureCollection,
      'date',
      ['Residual_NDVI']
  )
  .setChartType('LineChart')
  .setOptions({
      title: title,
      hAxis: {
        title: 'Date'
      },
      vAxis: {
        title: 'Residual NDVI',
        viewWindow: {min: -0.6, max: 0.4} 
      },
      lineWidth: 2,
      pointSize: 4,
      interpolateNulls: true, // Seamlessly connects data gaps 
      colors: ['crimson']
  });

  print(chart);
}


// ------------------------------------------------------
// STEP 5: Generate and Print the 5 Individual Residual Charts
// ------------------------------------------------------
plotResidualChart(denseResidual1, 'Dense Forest 1 - Residual NDVI Timeline');
plotResidualChart(denseResidual2, 'Dense Forest 2 - Residual NDVI Timeline');
plotResidualChart(mediumResidual,  'Medium Forest - Residual NDVI Timeline');
plotResidualChart(sparseResidual,  'Sparse Forest - Residual NDVI Timeline');
plotResidualChart(verySparseResidual, 'Very Sparse Forest - Residual NDVI Timeline');





// ======================================================
// TASK 4: SENTINEL-2 DATA AVAILABILITY AUDIT 
// ======================================================

function countMonthlyObservations(point, label) {
  
  var monthlyCounts = ee.FeatureCollection(
    months.map(function(month){
      month = ee.Number(month);

      
      var monthImages = s2Masked
        .filterBounds(point)
        .filter(ee.Filter.calendarRange(month, month, 'month'));

      
      var validObservationsCount = monthImages.map(function(img) {
        var stats = img.select('B4').reduceRegion({
          reducer: ee.Reducer.first(),
          geometry: point,
          scale: 10
        });
        
       
        var isValid = ee.Algorithms.If(stats.get('B4'), 1, 0);
        return ee.Feature(null, {'is_valid': isValid});
      }).aggregate_sum('is_valid'); 

      return ee.Feature(null, {
        Location: label,
        Month: month,
        Valid_Observations: ee.Number(validObservationsCount)
      });
    })
  );

  return monthlyCounts;
}
// ------------------------------------------------------
// STEP 2 & 3: Run Audit and Merge 
// ------------------------------------------------------
var healthyAudit      = countMonthlyObservations(forestPoint, 'Healthy Forest');
var denseAudit1       = countMonthlyObservations(densePoint1, 'Dense Forest 1');
var denseAudit2       = countMonthlyObservations(densePoint2, 'Dense Forest 2');
var mediumAudit      = countMonthlyObservations(mediumPoint, 'Medium Forest');
var sparseAudit       = countMonthlyObservations(sparsePoint, 'Sparse Forest');
var verySparseAudit   = countMonthlyObservations(verySparsePoint, 'Very Sparse Forest');

var observationAudit = healthyAudit
    .merge(denseAudit1)
    .merge(denseAudit2)
    .merge(mediumAudit)
    .merge(sparseAudit)
    .merge(verySparseAudit);

print('Corrected Monthly Observation Audit Table', observationAudit);

Export.table.toDrive({
  collection: observationAudit,
  description: 'Task4_Monthly_Observation_Audit',
  fileFormat: 'CSV'
});
