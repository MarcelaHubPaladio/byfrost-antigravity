export function pointInPolygon(point: [number, number], vs: [number, number][]) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function isPointInFeature(lng: number, lat: number, feature: any) {
    if(!feature?.geometry?.coordinates) return false;
    const type = feature.geometry.type;
    const coords = feature.geometry.coordinates;
    if(type === "Polygon") {
        return pointInPolygon([lng, lat], coords[0]);
    } else if (type === "MultiPolygon") {
        for(let poly of coords) {
            if(pointInPolygon([lng, lat], poly[0])) return true;
        }
    }
    return false;
}
