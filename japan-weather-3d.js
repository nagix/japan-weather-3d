const JMATILE_URL = 'https://www.jma.go.jp/bosai/jmatile/data/nowc';
const HIMAWARI_URL = 'https://www.jma.go.jp/bosai/himawari/data/satimg';
const HIMAWARI_TYPE = {
    'b03': 'B03/ALBD',
    'b13': 'B13/TBB',
    'b08': 'B08/TBB',
    'rep': 'REP/ETC',
    'snd': 'SND/ETC'
};
const ATTRIBUTION = '© Japan Meteorological Agency 2020';
const DATE_FORMAT = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short'
};
const OPACITIES = {
    'hrpns': {'base': 1.5, 'stops': [[10, 1], [11, 0.5]]},
    'himawari-fd': 0.2,
    'himawari-jp': 0.2
};

class MapboxGLButtonControl {
    constructor(optionArray) {
        this._options = optionArray.map(options => ({
            className: options.className || '',
            title: options.title || '',
            eventHandler: options.eventHandler
        }));
    }

    onAdd(map) {
        const me = this;

        me._map = map;

        me._container = document.createElement('div');
        me._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

        me._buttons = me._options.map(options => {
            const button = document.createElement('button'),
                icon = document.createElement('span'),
                {className, title, eventHandler} = options;

            button.className = className;
            button.type = 'button';
            button.title = title;
            button.setAttribute('aria-label', title);
            button.onclick = eventHandler;

            icon.className = 'mapboxgl-ctrl-icon';
            icon.setAttribute('aria-hidden', true);
            button.appendChild(icon);

            me._container.appendChild(button);

            return button;
        });

        return me._container;
    }

    onRemove() {
        const me = this;

        me._container.parentNode.removeChild(me._container);
        me._map = undefined;
    }
}

function loadJSON(url) {
    return fetch(url).then(response => response.json());
}

function getTime(str) {
    return timestamp = Date.UTC(
        +str.slice(0, 4),
        +str.slice(4, 6) - 1,
        +str.slice(6, 8),
        +str.slice(8, 10),
        +str.slice(10, 12),
        +str.slice(12, 14)
    );
}

function getJSTDateString(str) {
    const tzOffset = (new Date().getTimezoneOffset() + 540) * 60000;
    const date = new Date(getTime(str) + tzOffset);
    const dateString = date.toLocaleDateString('ja', DATE_FORMAT)
    const timeString = date.toLocaleTimeString('ja');
    return `${dateString} ${timeString}`;
}

function setSunPosition(map, str) {
    const center = map.getCenter();
    const sunPos = SunCalc.getPosition(
        getTime(str),
        center.lat,
        center.lng
    );
    const sunAzimuth = 180 + (sunPos.azimuth * 180) / Math.PI;
    const sunAltitude = 90 - (sunPos.altitude * 180) / Math.PI;
    map.setPaintProperty('sky', 'sky-atmosphere-sun', [sunAzimuth, sunAltitude]);
}

function setVisibility(map, frame, visible) {
    const visibility = visible ? 'visible' : 'none';
    for (const key of ['hrpns', 'himawari-fd', 'himawari-jp']) {
        const {id} = frame[key];
        if (id) {
            map.setLayoutProperty(id, 'visibility', visibility);
        }
    }
}

function setOpacity(map, frame, opaque) {
    for (const key of ['hrpns', 'himawari-fd', 'himawari-jp']) {
        const {id} = frame[key];
        if (id) {
            const opacity = opaque ? OPACITIES[key] : 0;
            map.setPaintProperty(id, 'raster-opacity', opacity);
        }
    }
}

function hideFrame(map, frames, index, keep) {
    const frame = frames[index];
    for (let i = 0; i < frames.length; i++) {
        for (const key of ['hrpns', 'himawari-fd', 'himawari-jp']) {
            const {id} = frames[i][key];
            if (id && (!keep || frames[i][key].id !== frame[key].id)) {
                map.setLayoutProperty(id, 'visibility', 'none');
            }
        }
    }
    if (!keep) {
        setOpacity(map, frame, false);
    }
}

function showFrame(map, frames, index) {
    const frame = frames[index];
    if (frame) {
        setVisibility(map, frame, true);
        setOpacity(map, frame, true);
    }
    for (let i = 0; i < frames.length; i++) {
        setTimeout(() => {
           setVisibility(map, frames[i], true);
        }, Math.abs(i - index) * 20);
    }
}

function getLatestTarget(data, validtime) {
    return data.reduce(
        (acc, cur) => cur.validtime <= validtime ? cur : acc,
        undefined
    );
}

function initHrpnsLayers(map, frames) {
    for (const frame of frames) {
        const {id, basetime, validtime} = frame['hrpns'];
        map.addSource(id, {
            'type': 'raster',
            'tiles': [
                `${JMATILE_URL}/${basetime}/none/${validtime}/surf/hrpns/{z}/{x}/{y}.png`
            ],
            'tileSize': 256,
            'minzoom': 2,
            'maxzoom': 10,
            'attribution': ATTRIBUTION
        });
        map.addLayer({
            'id': id,
            'type': 'raster',
            'source': id,
            'layout': {
                'visibility': 'none'
            },
            'paint': {
                'raster-opacity': 0,
                'raster-opacity-transition': {
                    'duration': 0
                }
            }
        });
    }
}

function initHimawariFdLayers(map, frames, type) {
    for (const frame of frames) {
        const {id, basetime, validtime} = frame[`himawari-fd`];
        if (id && !map.getLayer(id)) {
            map.addSource(id, {
                'type': 'raster',
                'tiles': [
                    `${HIMAWARI_URL}/${basetime}/fd/${validtime}/${HIMAWARI_TYPE[type]}/{z}/{x}/{y}.jpg`
                ],
                'tileSize': 256,
                'minzoom': 3,
                'maxzoom': 5,
                'attribution': ATTRIBUTION
            });
            map.addLayer({
                'id': id,
                'type': 'raster',
                'source': id,
                'maxzoom': 6,
                'layout': {
                    'visibility': 'none'
                },
                'paint': {
                    'raster-opacity': 0,
                    'raster-opacity-transition': {
                        'duration': 0
                    },
                    'raster-contrast': 0.8
                }
            }, frame['hrpns'].id);
        }
    }
}

function initHimawariJpLayers(map, frames, type) {
    for (const frame of frames) {
        const {id, basetime, validtime} = frame[`himawari-jp`];
        if (id && !map.getLayer(id)) {
            map.addSource(id, {
                'type': 'raster',
                'tiles': [
                    `${HIMAWARI_URL}/${basetime}/jp/${validtime}/${HIMAWARI_TYPE[type]}/{z}/{x}/{y}.jpg`
                ],
                'tileSize': 256,
                'minzoom': 6,
                'maxzoom': 6,
                'attribution': ATTRIBUTION
            });
            map.addLayer({
                'id': id,
                'type': 'raster',
                'source': id,
                'minzoom': 6,
                'layout': {
                    'visibility': 'none'
                },
                'paint': {
                    'raster-opacity': 0,
                    'raster-opacity-transition': {
                        'duration': 0
                    },
                    'raster-contrast': 0.8
                }
            }, frame['hrpns'].id);
        }
    }
}

function removeLayers(map, frames, key) {
    for (let i = 0; i < frames.length; i++) {
        const {id} = frames[i][key];
        if (map.getLayer(id)) {
            map.removeLayer(id);
            map.removeSource(id);
        }
    }
}

function refreshFrames() {
    return Promise.all([
        `${JMATILE_URL}/targetTimes_N1.json`,
        `${JMATILE_URL}/targetTimes_N2.json`,
        `${HIMAWARI_URL}/targetTimes_fd.json`,
        `${HIMAWARI_URL}/targetTimes_jp.json`
    ].map(loadJSON)).then(([n1, n2, himawariFdData, himawariJpData]) => {
        if (n1[0].validtime === n2[n2.length - 1].validtime) {
            n2.pop();
        }
        const hrpnsData = [...n1.reverse(), ...n2.reverse()];
        const frames = [];
        for (let i = 0; i < hrpnsData.length; i++) {
            const {basetime, validtime} = hrpnsData[i];
            const himawariFdTarget = getLatestTarget(himawariFdData, validtime);
            const himawariJpTarget = getLatestTarget(himawariJpData, validtime);
            frames.push({
                'hrpns': {
                    id: `hrpns-${validtime}`,
                    basetime,
                    validtime
                },
                'himawari-fd': i <= 36 && himawariFdTarget ? {
                    id: himawariFdId = `himawari-fd-${himawariFdTarget.validtime}`,
                    basetime: himawariFdTarget.basetime,
                    validtime: himawariFdTarget.validtime
                } : {},
                'himawari-jp': i <= 36 && himawariFdTarget ? {
                    id: himawariJpId = `himawari-jp-${himawariJpTarget.validtime}`,
                    basetime: himawariJpTarget.basetime,
                    validtime: himawariJpTarget.validtime
                } : {}
            });
        }
        return frames;
    });
}

function refreshSlider(frames) {
    const sliderTicks = document.getElementById('slider-ticks');
    const lastIndex = frames.length - 1;
    sliderTicks.innerHTML = '';
    for (let i = 0; i < frames.length; i++) {
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        tick.setAttribute('cx', i * 264 / lastIndex + 8);
        tick.setAttribute('cy', 2);
        tick.setAttribute('r', i % 12 ? 1 : 2);
        tick.setAttribute('fill', i === 36 ? '#f00' : '#999');
        sliderTicks.append(tick);
    }
    document.getElementById('slider-value').textContent = getJSTDateString(frames[current]['hrpns'].validtime);
    document.getElementById('slider').max = lastIndex;
}

function initLayers(map, frames, newFrames, type, current) {
    if (frames.length) {
        for (const key of ['hrpns', 'himawari-fd', 'himawari-jp']) {
            removeLayers(map, frames, key);
        }
        frames.length = 0;
    }
    frames.splice(0, frames.length, ...newFrames);
    initHrpnsLayers(map, frames);
    initHimawariFdLayers(map, frames, type);
    initHimawariJpLayers(map, frames, type);
    showFrame(map, frames, current);
    refreshSlider(frames);
    setSunPosition(map, frames[current]['hrpns'].validtime);
}

const slider = document.getElementById('slider');
const sliderValue = document.getElementById('slider-value');
const sliderTag = document.getElementById('slider-tag');
const himawariMenuBg = document.getElementById('himawari-menu-bg');
const infoBg = document.getElementById('info-bg');
const frames = [];
let current = 36;
let himawariType = 'b13';

mapboxgl.accessToken = 'pk.eyJ1IjoibmFnaXgiLCJhIjoiY2tuazZkeWFyMDR1YTJwbXB3YndxNjZobyJ9.HMFX0bkfoSMP8aMUWDlz2g';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'japan-weather-3d.json',
    hash: true
});
map.addControl(new mapboxgl.NavigationControl());
map.addControl(new mapboxgl.FullscreenControl());
map.addControl(new MapboxGLButtonControl([{
    className: 'mapboxgl-ctrl-himawari',
    title: 'ひまわり画像',
    eventHandler() {
        himawariMenuBg.style.display = 'block';
    }
}, {
    className: 'mapboxgl-ctrl-info',
    title: 'Japan Weather 3D について',
    eventHandler() {
        infoBg.style.display = 'block';
    }
}]));

slider.addEventListener('input', function (e) {
    hideFrame(map, frames, current);
    current = parseInt(e.target.value);
    showFrame(map, frames, current);
    const {validtime} = frames[current]['hrpns'];
    sliderValue.textContent = getJSTDateString(validtime);
    sliderTag.style.visibility = current <= 36 ? 'hidden' : 'visible';
    setSunPosition(map, validtime);
});

himawariMenuBg.addEventListener('click', () => {
    himawariMenuBg.style.display = 'none';
});
for (const type of ['b03', 'b13', 'b08', 'rep', 'snd']) {
    const e = document.getElementById(type);
    e.addEventListener('click', function (e) {
        document.querySelector('.active').classList.remove('active');
        e.target.classList.add('active');
        himawariMenuBg.style.display = 'none';
        hideFrame(map, frames, current, true);
        for (const key of ['himawari-fd', 'himawari-jp']) {
            removeLayers(map, frames, key);
        }
        initHimawariFdLayers(map, frames, type);
        initHimawariJpLayers(map, frames, type);
        showFrame(map, frames, current);
        himawariType = type;
    });
}

infoBg.addEventListener('click', () => {
    infoBg.style.display = 'none';
});

map.on('load', () => {
    refreshFrames().then(newFrames => {
        initLayers(map, frames, newFrames, himawariType, current);
    });
    setInterval(() => {
        refreshFrames().then(newFrames => {
            initLayers(map, frames, newFrames, himawariType, current);
        });
    }, 300000);
});

map.on('move', e => {
    setSunPosition(map, frames[current]['hrpns'].validtime);
});

map.on('movestart', e => {
    hideFrame(map, frames, current, true);
});

map.on('moveend', e => {
    showFrame(map, frames, current);
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
        refreshFrames().then(newFrames => {
            initLayers(map, frames, newFrames, himawariType, current);
        });
    }
});
