mapboxgl.accessToken = 'pk.eyJ1Ijoicm1uc3JhbjciLCJhIjoiY20ydDVtZnFyMDBmNjJscHNhbmlweDkzYyJ9.lUECFhg6LYHBKaea1oUy1w';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [-97.1384, 49.8951],
    projection: 'mercator',
    zoom: 10
});


const state = {
    loadedSources: new Set(),
    features: {
        pch_points: [],
        hospital_points: [],
        wfps_points: []
    }
};

map.on('load', async () => {
    const sourcesAndLayers = [{
            id: 'pch_points',
            source: {
                type: 'geojson',
                data: 'https://rmnsran7.github.io/wpg_pch_project/PCH_WPG.json'
            },
            layer: {
                id: 'pch_points',
                type: 'symbol',
                source: 'pch_points',
                layout: {
                    'text-field': '■',
                    'text-size': 28
                },
                paint: {
                    'text-color': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        'hsl(120, 100%, 50%)',
                        '#4CAF50'
                    ],
                    'text-halo-color': 'black',
                    'text-halo-width': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        1,
                        0.5
                    ]
                }
            }
        },
        {
            id: 'hospital_points',
            source: {
                type: 'geojson',
                data: 'https://rmnsran7.github.io/wpg_pch_project/Hospitals_WPG.json'
            },
            layer: {
                id: 'hospital_points',
                type: 'circle',
                source: 'hospital_points',
                paint: {
                    'circle-radius': 9,
                    'circle-color': 'red',
                    'circle-stroke-width': 0.5,
                    'circle-stroke-color': 'black'
                }
            }
        },
        {
            id: 'wfps_points',
            source: {
                type: 'geojson',
                data: 'https://rmnsran7.github.io/wpg_pch_project/WFPS_WPG.json'
            },
            layer: {
                id: 'wfps_points',
                type: 'symbol',
                source: 'wfps_points',
                layout: {
                    'text-field': '◆',
                    'text-size': 32
                },
                paint: {
                    'text-color': '#20d0df',
                    'text-halo-color': 'black',
                    'text-halo-width': 0.5
                }
            }
        }
    ];


    let hospitalRouteLayers = [];
    let paramedicRouteLayers = [];

    // Function to load data for a source
    async function loadSourceData(sourceId, url) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            state.features[sourceId] = data.features;
            state.loadedSources.add(sourceId);
            return data;
        } catch (error) {
            console.error(`Error loading data for ${sourceId}:`, error);
            return null;
        }
    }


    function calculateLayerStats(sourceId, propertyName) {
        const features = state.features[sourceId];
        if (!features || features.length === 0) {
            console.error(`No features found for ${sourceId}`);
            return null;
        }

        const stats = features.reduce((acc, feature) => {
            const value = feature.properties[propertyName];
            if (typeof value === 'number') {
                acc.total += value;
                acc.min = Math.min(acc.min, value);
                acc.max = Math.max(acc.max, value);
                acc.count++;
            }
            return acc;
        }, { min: Infinity, max: -Infinity, total: 0, count: 0 });

        return {
            min: stats.min,
            max: stats.max,
            average: stats.total / stats.count,
            total: stats.total,
            count: stats.count
        };
    }


    function addRouteLayer(layerId, data, color = 'red', routeType) {
        layerId = String(layerId);

        if (!data || data.type !== 'FeatureCollection') {
            console.error('Invalid GeoJSON data provided.');
            return;
        }

        if (routeType === 'hospital') {
            removeLayers(hospitalRouteLayers);
        } else if (routeType === 'paramedic') {
            removeLayers(paramedicRouteLayers);
        }

        if (map.getSource(layerId)) {
            map.removeSource(layerId);
        }

        map.addSource(layerId, {
            type: 'geojson',
            data
        });

        map.addLayer({
            id: layerId + '-halo',
            type: 'line',
            source: layerId,
            paint: {
                'line-width': 10,
                'line-color': 'white',
                'line-opacity': 0.7
            }
        });

        map.addLayer({
            id: layerId,
            type: 'line',
            source: layerId,
            paint: {
                'line-width': 5,
                'line-color': color,
                'line-opacity': 0.8
            }
        });

        if (routeType === 'hospital') {
            hospitalRouteLayers.push(layerId, layerId + '-halo');
        } else if (routeType === 'paramedic') {
            paramedicRouteLayers.push(layerId, layerId + '-halo');
        }

        const coordinates = data.features[0].geometry.coordinates;
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
        
        map.fitBounds(bounds, {
            padding: 200
        });
    }


    function removeLayers(layers) {
        layers.forEach(layerId => {
            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
        });

        layers.forEach(layerId => {
            if (map.getSource(layerId)) {
                map.removeSource(layerId);
            }
        });

        layers.length = 0;
    }


function fetchAndAddStaticRoutes(pchId, rankId) {
    const hospitalUrl = `https://rmnsran7.github.io/wpg_pch_project/routes_hosp/route_p-${pchId}_r-${rankId}.geojson`;
    const paramedicUrl = `https://rmnsran7.github.io/wpg_pch_project/routes_wfp/route_p-${pchId}_r-${rankId}.geojson`;


    const pchFeature = state.features.pch_points.find(f => f.properties.OBJECTID === pchId);

    Promise.all([
        fetch(hospitalUrl).then(res => res.json()),
        fetch(paramedicUrl).then(res => res.json())
    ]).then(([hospitalRoute, paramedicRoute]) => {
        if (hospitalRoute.type === 'FeatureCollection' && paramedicRoute.type === 'FeatureCollection') {
            // Add routes to map
            
            addRouteLayer(`static_paramedic_route_${pchId}_${rankId}`, paramedicRoute, '#2ed1b1', 'paramedic');
            addRouteLayer(`static_hospital_route_${pchId}_${rankId}`, hospitalRoute, 'red', 'hospital');

            // Find nearest hospital and WFPS based on routes
            const hospitalEnd = hospitalRoute.features[0].geometry.coordinates.slice(-1)[0];
            const wfpsEnd = paramedicRoute.features[0].geometry.coordinates.slice(-1)[0];

            const nearestHospital = findNearestFeature(hospitalEnd, state.features.hospital_points);
            const nearestWFPS = findNearestFeature(wfpsEnd, state.features.wfps_points);

            // Update route information
            updateRouteInfo(pchFeature, hospitalRoute, paramedicRoute, nearestHospital, nearestWFPS);

            // Update route ranking display
            document.getElementById('routeRanking').style.display = 'block';
            document.getElementById('currentRank').textContent = rankId;

            // Handle next route button visibility
            const nextRouteBtn = document.getElementById('nextRouteBtn');
            if (hospitalRoute.features[0].properties.rank_by_time < 5) {
                nextRouteBtn.style.display = 'block';
                // Clear any existing event listeners
                nextRouteBtn.replaceWith(nextRouteBtn.cloneNode(true));
                // Add new event listener
                document.getElementById('nextRouteBtn').addEventListener('click', () => {
                    fetchAndAddStaticRoutes(pchId, rankId + 1);
                });
            } else {
                nextRouteBtn.style.display = 'none';
            }
        }
    }).catch(error => console.error('Error loading routes:', error));
}


function findNearestFeature(coordinates, features) {
    return features.reduce((nearest, feature) => {
        const dist = getDistance(
            coordinates[1], coordinates[0],
            feature.geometry.coordinates[1], feature.geometry.coordinates[0]
        );
        if (!nearest || dist < nearest.distance) {
            return { distance: dist, ...feature };
        }
        return nearest;
    }, null);
}



    function applyLayerFilter(sourceId, property, value) {
        if (!map.getLayer(sourceId)) {
            console.error(`Layer ${sourceId} not found`);
            return;
        }

        const filter = value === 'all' ? 
            null : 
            ['==', ['get', property], value];
        
        map.setFilter(sourceId, filter);
    }


    function getRealTimeRoutes(fromCoords, hospitalCoords, paramedicCoords) {
        fetchAndAddRealTimeRoute(fromCoords, hospitalCoords, 'hospital');
        fetchAndAddRealTimeRoute(fromCoords, paramedicCoords, 'paramedic');
    }

    function fetchAndAddRealTimeRoute(fromCoords, toCoords, routeType) {
        const accessToken = mapboxgl.accessToken;
        const apiUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromCoords.join(',')};${toCoords.join(',')}?geometries=geojson&access_token=${accessToken}`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                if (data.routes && data.routes[0].geometry) {
                    addRouteLayer(`real_time_${routeType}_route`, {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            geometry: data.routes[0].geometry
                        }]
                    }, routeType === 'hospital' ? 'red' : 'purple', routeType);
                } else {
                    console.error(`No route found for ${routeType}.`);
                }
            })
            .catch(error => console.error(`Error fetching real-time ${routeType} route:`, error));
    }


    function populateFilterOptions(sourceId, selectElement, property) {
        if (!state.features[sourceId]) {
            console.error(`No features loaded for ${sourceId}`);
            return;
        }

        const uniqueValues = new Set();
        state.features[sourceId].forEach(feature => {
            const value = feature.properties[property];
            if (value) uniqueValues.add(value);
        });

        // Clear existing options
        selectElement.innerHTML = '<option value="all">All</option>';

        // Add new options
        Array.from(uniqueValues).sort().forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            selectElement.appendChild(option);
        });
    }

    // Add real-time button
    function addRealTimeButton(fromCoords, hospitalCoords, paramedicCoords) {
        const button = document.createElement('button');
        button.textContent = 'Get Real-Time Routes';
        button.style.position = 'absolute';
        button.style.top = '10px';
        button.style.left = '10px';
        button.style.zIndex = '1';
        document.body.appendChild(button);

        button.addEventListener('click', () => {
            fetchAndAddRealTimeRoute(fromCoords, hospitalCoords, 'hospital');
            fetchAndAddRealTimeRoute(fromCoords, paramedicCoords, 'paramedic');
        });
    }

    // Initialize layers and load data
    for (const item of sourcesAndLayers) {
        try {
            // Load data first
            const data = await loadSourceData(item.id, item.source.data);
            if (!data) continue;

            // Add source and layer to map
            if (!map.getSource(item.id)) {
                map.addSource(item.id, {
                    type: 'geojson',
                    data: data
                });
            }

            if (!map.getLayer(item.id)) {
                map.addLayer(item.layer);
            }

            // Setup event listeners
            map.on('click', item.id, (e) => {
                if (e.features.length === 0) return;
                
                const feature = e.features[0];
                console.log(`Clicked feature properties:`, feature.properties);
                
                if (item.id === 'pch_points') {
                    const pch_id = feature.properties.OBJECTID;
                    fetchAndAddStaticRoutes(pch_id, 1);
                } else if (item.id === 'hospital_points') {
                    const coordinates = feature.geometry.coordinates.slice();
                    const description = feature.properties.Address;
                    
                    new mapboxgl.Popup()
                        .setLngLat(coordinates)
                        .setHTML(`<strong>Description:</strong> ${description}`)
                        .addTo(map);
                }
            });

            // Add hover effects
            let hoveredStateId = null;

            map.on('mouseenter', item.id, (e) => {
                map.getCanvas().style.cursor = 'pointer';
                if (e.features.length > 0 && item.id === 'pch_points') {
                    if (hoveredStateId) {
                        map.setFeatureState(
                            { source: item.id, id: hoveredStateId },
                            { hover: false }
                        );
                    }
                    hoveredStateId = e.features[0].id;
                    map.setFeatureState(
                        { source: item.id, id: hoveredStateId },
                        { hover: true }
                    );
                }
            });

            map.on('mouseleave', item.id, () => {
                map.getCanvas().style.cursor = '';
                if (hoveredStateId && item.id === 'pch_points') {
                    map.setFeatureState(
                        { source: item.id, id: hoveredStateId },
                        { hover: false }
                    );
                    hoveredStateId = null;
                }
            });

        } catch (error) {
            console.error(`Error setting up ${item.id}:`, error);
        }
    }

    // Setup zoom button
    document.getElementById('zoomButton')?.addEventListener('click', () => {
        map.flyTo({
            center: [-97.1384, 49.8951],
            zoom: 10,
            speed: 3,
            curve: 1
        });
        
        removeLayers(hospitalRouteLayers);
        removeLayers(paramedicRouteLayers);
        removeFiltersFromLayers()
        // Reset route information display
        document.getElementById('nextRouteBtn').style.display = 'none';
        document.getElementById('routeRanking').style.display = 'none';
        document.getElementById('noRouteSelected').style.display = 'block';
        document.getElementById('routeInfo').style.display = 'none';

    }); 


// Function to remove filters from specific layers
function removeFiltersFromLayers() {
      map.setFilter('pch_points', null);
      map.setFilter('hospital_points', null);
      map.setFilter('wfps_points', null);
      const selectElement1 = document.getElementById("hospitalNameSelect");
      selectElement1[0].selected = true;
      const selectElement2 = document.getElementById("pchCommunity");
      selectElement2[0].selected = true;
      remove_slider = document.getElementById("pchBeds");
      remove_slider.value = 50;
      document.getElementById("bedCountDisplay").textContent = 50;
      document.querySelector('.stationall').checked = true
}

// Function to count stations by type
function countStationTypes() {
    const counts = {
        'Fire Only': 0,
        'Paramedic Only': 0,
        'Fire Paramedic Combined': 0,
        'all_stype': 0
    };
    
    // Get all visible features
    const features = map.queryRenderedFeatures({
        layers: ['wfps_points']
    });
    
    features.forEach(feature => {
        const stationType = feature.properties.station_type;
        if (stationType) {
            counts[stationType]++;
            counts['all_stype']++;
        }
    });
    
    return counts;
}


// Function to update route information
function updateRouteInfo(pchFeature, hospitalRoute, wfpsRoute, hospitalFeature, wfpsFeature) {
    // Show route info and hide the initial message
    document.getElementById('noRouteSelected').style.display = 'none';
    document.getElementById('routeInfo').style.display = 'block';

    // Update PCH details
    document.getElementById('pchName').textContent = pchFeature.properties.Facility_Label || '-';
    document.getElementById('pchAddress').textContent = pchFeature.properties.Address || '-';
    document.getElementById('pchBedCount').textContent = pchFeature.properties.Beds || '-';

    // Update Hospital route details
    if (hospitalRoute && hospitalFeature) {

        const hospitalDistance = calculateRouteDistance(hospitalRoute);
        const hospitalTime = estimateRouteTime(hospitalDistance);
        
        document.getElementById('hospitalName').textContent = hospitalFeature.properties.Hospital_Name || '-';
        document.getElementById('hospitalDistance').textContent = `${hospitalDistance.toFixed(1)} km`;
        document.getElementById('hospitalTime').textContent = formatTime(hospitalTime);
        document.getElementById('hospitalAddress').textContent = hospitalFeature.properties.Address || '-';
        document.getElementById('hospitalPhone').textContent = hospitalFeature.properties.Phone || '-';
    }

    // Update WFPS route details
    if (wfpsRoute && wfpsFeature) {
        const wfpsDistance = calculateRouteDistance(wfpsRoute);
        const wfpsTime = estimateRouteTime(wfpsDistance);
        
        document.getElementById('wfpsName').textContent = `Station ${wfpsFeature.properties.station_number}` || '-';
        document.getElementById('wfpsDistance').textContent = `${wfpsDistance.toFixed(1)} km`;
        document.getElementById('wfpsTime').textContent = formatTime(wfpsTime);
        document.getElementById('wfpsType').textContent = wfpsFeature.properties.station_type || '-';
        document.getElementById('wfpsAddress').textContent = wfpsFeature.properties.address || '-';
    }
}

// Helper function to calculate route distance in kilometers
function calculateRouteDistance(route) {
    if (!route || !route.features || !route.features[0].geometry) return 0;
    
    const coordinates = route.features[0].geometry.coordinates;
    let distance = 0;
    
    for (let i = 1; i < coordinates.length; i++) {
        distance += getDistance(
            coordinates[i-1][1], coordinates[i-1][0],
            coordinates[i][1], coordinates[i][0]
        );
    }
    
    return distance;
}

// Helper function to calculate distance between two points using Haversine formula
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(degrees) {
    return degrees * Math.PI / 180;
}

// Helper function to estimate route time based on distance
function estimateRouteTime(distance) {
    const avgSpeed = 40; // Average speed in km/h
    return (distance / avgSpeed) * 60; // Convert to minutes
}

// Helper function to format time
function formatTime(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hrs === 0) return `${mins} mins`;
    return `${hrs}h ${mins}m`;
}



// Function to update the count displays
function updateStationTypeCounts() {
    const counts = countStationTypes();
    
    // Update each count display
    document.getElementById('fire_only_count').textContent = `(${counts['Fire Only']})`;
    document.getElementById('paramedic_only_count').textContent = `(${counts['Paramedic Only']})`;
    document.getElementById('combined_count').textContent = `(${counts['Fire Paramedic Combined']})`;
    document.getElementById('all_stype_count').textContent = `(${counts['all_stype']})`;
}



    // Setup filter event listeners
    document.getElementById('pchCommunity')?.addEventListener('change', (e) => {
        applyLayerFilter('pch_points', 'Community', e.target.value);
    });

    // Setup filter event listeners (continued)
    document.getElementById('hospitalNameSelect')?.addEventListener('change', (e) => {
        applyLayerFilter('hospital_points', 'Hospital_Name', e.target.value);
    });

    // Setup filter event listeners (continued)
document.querySelectorAll('input[name="station_type"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === "all_stype") { // or if (e.target.value === null) if it can be null
            map.setFilter('wfps_points', null);
        } else {
            applyLayerFilter('wfps_points', 'station_type', e.target.value);
        }
        
        
        console.log("Station Type: ", e.target.value);
    });
});


       // Setup filter event listeners (continued)
       document.getElementById('pchBeds')?.addEventListener('change', (e) => {
        // Parse the input value to an integer
        const bedsValue = parseInt(e.target.value, 10);
    
        // Apply filter for values greater than or equal to bedsValue
        map.setFilter('pch_points', ['>=', ['get', 'Beds'], bedsValue]);
        console.log("Beds: ", bedsValue);
        document.getElementById("bedCountDisplay").textContent = bedsValue;
    });    


    // Initialize filter options
    map.once('idle', () => {
        updateStationTypeCounts();
        // Populate filter dropdowns
        const pchCommunitySelect = document.getElementById('pchCommunity');
        const hospitalNameSelect = document.getElementById('hospitalNameSelect');
        
        if (pchCommunitySelect) {
            populateFilterOptions('pch_points', pchCommunitySelect, 'Community');
        }
        
        if (hospitalNameSelect) {
            populateFilterOptions('hospital_points', hospitalNameSelect, 'Hospital_Name');
        }

        // Calculate and log statistics for PCH beds
        const bedStats = calculateLayerStats('pch_points', 'Beds');
        if (bedStats) {

            document.getElementById("minBeds").textContent = "Min: " + bedStats.min;
            document.getElementById("avgBeds").textContent = "Avg: " + bedStats.average.toFixed(2);
            document.getElementById("maxBeds").textContent = "Max: " + bedStats.max;
            document.getElementById("totBeds").textContent = bedStats.total;
            document.getElementById("totalpch").textContent = bedStats.count;
            document.getElementById("totalHospital").textContent = state.features.hospital_points.length;
            document.getElementById("totalWFPS").textContent = state.features.wfps_points.length;

            console.log('PCH Bed Statistics:', {
                'Least Beds': bedStats.min,
                'Most Beds': bedStats.max,
                'Average Beds': bedStats.average.toFixed(2),
                'Total Beds': bedStats.total,
                'Number of Facilities': bedStats.count
            });
        }
    });

    // Log loaded sources for debugging
    map.once('idle', () => {
        console.log('Loaded sources:', Array.from(state.loadedSources));
        console.log('Available features:', {
            'PCH Points': state.features.pch_points.length,
            'Hospital Points': state.features.hospital_points.length,
            'WFPS Points': state.features.wfps_points.length
        });
    });
});


map.on('error', (e) => {
    console.error('Map error:', e.error);
});


map.on('style.load', () => {
    console.log('Map style loaded successfully');
});

map.on('styledata', (e) => {
    console.log('Style data updated');
});


function isDataLoaded() {
    return state.loadedSources.size === 3; // Expecting all three sources to be loaded
}


function validateCoordinates(coords) {
    return Array.isArray(coords) && 
           coords.length === 2 && 
           typeof coords[0] === 'number' && 
           typeof coords[1] === 'number';
}


if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateLayerStats,
        applyLayerFilter,
        populateFilterOptions,
        isDataLoaded,
        validateCoordinates
    };
}
