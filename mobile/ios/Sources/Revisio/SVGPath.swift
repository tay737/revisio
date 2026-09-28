import CoreGraphics
import Foundation
import SwiftUI

/// SVG path data, as `Path`.
///
/// The icon set is generated from the geometry the browser draws
/// (`scripts/native/make-icons.mjs`), and that geometry is SVG path data.
/// Android hands those strings straight to Compose's `PathParser`; SwiftUI has
/// no equivalent, so this is the missing half.
///
/// It implements the command set lucide uses, including elliptical arcs — which
/// are not optional here, because the generator renders `<circle>` and
/// `<ellipse>` elements as arcs and several icons carry them in their own path
/// data. An arc becomes up to four cubic curves via the endpoint-to-centre
/// conversion in the SVG specification, section F.6.
enum SVGPath {
    static func parse(_ d: String) -> Path {
        var path = Path()
        var scanner = Scanner(d)
        var current = CGPoint.zero
        var subpathStart = CGPoint.zero
        var lastControl: CGPoint?

        while let letter = scanner.nextCommand() {
            // A command letter is followed by one or more argument groups; once
            // its arguments run out, more numbers mean "repeat the same command".
            // A repeated moveto is a lineto, which is the one special case.
            var command = letter
            repeat {
                switch command {
                case "M", "m":
                    guard let point = scanner.point(relativeTo: current, isRelative: command == "m")
                    else { return path }
                    path.move(to: point)
                    subpathStart = point
                    current = point
                    lastControl = nil

                case "L", "l":
                    guard let point = scanner.point(relativeTo: current, isRelative: command == "l")
                    else { return path }
                    path.addLine(to: point)
                    current = point
                    lastControl = nil

                case "H", "h":
                    guard let x = scanner.number() else { return path }
                    let point = CGPoint(x: command == "h" ? current.x + x : x, y: current.y)
                    path.addLine(to: point)
                    current = point
                    lastControl = nil

                case "V", "v":
                    guard let y = scanner.number() else { return path }
                    let point = CGPoint(x: current.x, y: command == "v" ? current.y + y : y)
                    path.addLine(to: point)
                    current = point
                    lastControl = nil

                case "C", "c":
                    guard let group = scanner.numbers(6) else { return path }
                    let relative = command == "c"
                    let control1 = offset(group, 0, current, relative)
                    let control2 = offset(group, 2, current, relative)
                    let end = offset(group, 4, current, relative)
                    path.addCurve(to: end, control1: control1, control2: control2)
                    current = end
                    lastControl = control2

                case "S", "s":
                    guard let group = scanner.numbers(4) else { return path }
                    let relative = command == "s"
                    // The first control point mirrors the previous one.
                    let reflected =
                        lastControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) }
                        ?? current
                    let control2 = offset(group, 0, current, relative)
                    let end = offset(group, 2, current, relative)
                    path.addCurve(to: end, control1: reflected, control2: control2)
                    current = end
                    lastControl = control2

                case "Q", "q":
                    guard let group = scanner.numbers(4) else { return path }
                    let relative = command == "q"
                    let control = offset(group, 0, current, relative)
                    let end = offset(group, 2, current, relative)
                    path.addQuadCurve(to: end, control: control)
                    current = end
                    lastControl = control

                case "T", "t":
                    guard let group = scanner.numbers(2) else { return path }
                    let relative = command == "t"
                    let reflected =
                        lastControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) }
                        ?? current
                    let end = offset(group, 0, current, relative)
                    path.addQuadCurve(to: end, control: reflected)
                    current = end
                    lastControl = reflected

                case "A", "a":
                    guard let group = scanner.numbers(7) else { return path }
                    let relative = command == "a"
                    let end = offset(group, 5, current, relative)
                    addArc(
                        to: &path,
                        from: current,
                        rx: group[0],
                        ry: group[1],
                        rotationDegrees: group[2],
                        largeArc: group[3] != 0,
                        sweep: group[4] != 0,
                        end: end
                    )
                    current = end
                    lastControl = nil

                case "Z", "z":
                    path.closeSubpath()
                    current = subpathStart
                    lastControl = nil

                default:
                    // An unknown command would leave the scanner mid-stream.
                    // Stop rather than emit a garbled glyph.
                    return path
                }

                command = command == "M" ? "L" : command == "m" ? "l" : command
            } while scanner.hasNumber
        }

        return path
    }

    private static func offset(
        _ group: [CGFloat], _ at: Int, _ current: CGPoint, _ relative: Bool
    ) -> CGPoint {
        let x = group[at]
        let y = group[at + 1]
        return relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
    }

    // ── arcs ────────────────────────────────────────────────────────────────

    /// Append an SVG elliptical arc as up to four cubic curves (spec F.6.5).
    private static func addArc(
        to path: inout Path,
        from start: CGPoint,
        rx rawRx: CGFloat,
        ry rawRy: CGFloat,
        rotationDegrees: CGFloat,
        largeArc: Bool,
        sweep: Bool,
        end: CGPoint
    ) {
        guard start != end else { return }
        var rx = abs(rawRx)
        var ry = abs(rawRy)
        // A zero radius is defined to mean a straight line.
        guard rx > 0, ry > 0 else {
            path.addLine(to: end)
            return
        }

        let phi = rotationDegrees * .pi / 180
        let cosPhi = cos(phi)
        let sinPhi = sin(phi)

        // Step 1: the chord midpoint, rotated into the ellipse's own frame.
        let dx = (start.x - end.x) / 2
        let dy = (start.y - end.y) / 2
        let x1 = cosPhi * dx + sinPhi * dy
        let y1 = -sinPhi * dx + cosPhi * dy

        // Step 2: grow the radii if they cannot span the two points.
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 {
            let scale = lambda.squareRoot()
            rx *= scale
            ry *= scale
        }

        // Step 3: the centre, back in user space.
        let numerator = max(0, rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1)
        let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
        let ratio = denominator == 0 ? 0 : (numerator / denominator).squareRoot()
        let coefficient = (largeArc == sweep ? -1.0 : 1.0) * ratio
        let cx1 = coefficient * rx * y1 / ry
        let cy1 = coefficient * -ry * x1 / rx
        let cx = cosPhi * cx1 - sinPhi * cy1 + (start.x + end.x) / 2
        let cy = sinPhi * cx1 + cosPhi * cy1 + (start.y + end.y) / 2

        // Step 4: start angle and sweep, in the ellipse's frame.
        let ux = (x1 - cx1) / rx
        let uy = (y1 - cy1) / ry
        let vx = (-x1 - cx1) / rx
        let vy = (-y1 - cy1) / ry
        let startAngle = atan2(uy, ux)

        var delta = angleBetween(ux, uy, vx, vy)
        if !sweep && delta > 0 { delta -= 2 * .pi }
        if sweep && delta < 0 { delta += 2 * .pi }

        // Step 5: a quarter turn per curve keeps the approximation accurate.
        let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
        let step = delta / CGFloat(segments)
        let alpha = 4.0 / 3.0 * tan(step / 4)

        var angle = startAngle
        for _ in 0..<segments {
            let next = angle + step
            let from = ellipsePoint(cx, cy, rx, ry, cosPhi, sinPhi, angle)
            let to = ellipsePoint(cx, cy, rx, ry, cosPhi, sinPhi, next)
            let d1 = ellipseDerivative(rx, ry, cosPhi, sinPhi, angle)
            let d2 = ellipseDerivative(rx, ry, cosPhi, sinPhi, next)
            path.addCurve(
                to: to,
                control1: CGPoint(x: from.x + alpha * d1.x, y: from.y + alpha * d1.y),
                control2: CGPoint(x: to.x - alpha * d2.x, y: to.y - alpha * d2.y)
            )
            angle = next
        }
    }

    private static func ellipsePoint(
        _ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat,
        _ cosPhi: CGFloat, _ sinPhi: CGFloat, _ angle: CGFloat
    ) -> CGPoint {
        let x = rx * cos(angle)
        let y = ry * sin(angle)
        return CGPoint(x: cx + cosPhi * x - sinPhi * y, y: cy + sinPhi * x + cosPhi * y)
    }

    /// The derivative of the ellipse at `angle`, for the control handles.
    private static func ellipseDerivative(
        _ rx: CGFloat, _ ry: CGFloat, _ cosPhi: CGFloat, _ sinPhi: CGFloat, _ angle: CGFloat
    ) -> CGPoint {
        let x = -rx * sin(angle)
        let y = ry * cos(angle)
        return CGPoint(x: cosPhi * x - sinPhi * y, y: sinPhi * x + cosPhi * y)
    }

    private static func angleBetween(
        _ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat
    ) -> CGFloat {
        let dot = ux * vx + uy * vy
        let lengths = (ux * ux + uy * uy).squareRoot() * (vx * vx + vy * vy).squareRoot()
        guard lengths > 0 else { return 0 }
        let ratio = min(1, max(-1, dot / lengths))
        let magnitude = acos(ratio)
        return (ux * vy - uy * vx) < 0 ? -magnitude : magnitude
    }

    // ── tokenizer ───────────────────────────────────────────────────────────

    /// Walks path data one number at a time.
    private struct Scanner {
        private let characters: [Character]
        private var index = 0

        init(_ text: String) {
            characters = Array(text)
        }

        private mutating func skipSeparators() {
            while index < characters.count {
                switch characters[index] {
                case ",", " ", "\n", "\t", "\r":
                    index += 1
                default:
                    return
                }
            }
        }

        /// The next command letter, or nil once the data runs out. Numbers are
        /// left in place; the caller's repeat loop consumes them.
        mutating func nextCommand() -> Character? {
            skipSeparators()
            guard index < characters.count, characters[index].isLetter else { return nil }
            let letter = characters[index]
            index += 1
            return letter
        }

        /// Whether another argument group follows the one just read.
        var hasNumber: Bool {
            var probe = index
            while probe < characters.count {
                switch characters[probe] {
                case ",", " ", "\n", "\t", "\r":
                    probe += 1
                default:
                    let c = characters[probe]
                    return c.isNumber || c == "." || c == "-" || c == "+"
                }
            }
            return false
        }

        mutating func number() -> CGFloat? {
            skipSeparators()
            guard index < characters.count else { return nil }
            var text = ""
            if characters[index] == "-" || characters[index] == "+" {
                text.append(characters[index])
                index += 1
            }
            var seenDot = false
            var seenExponent = false
            while index < characters.count {
                let c = characters[index]
                if c.isNumber {
                    text.append(c)
                    index += 1
                } else if c == "." && !seenDot && !seenExponent {
                    seenDot = true
                    text.append(c)
                    index += 1
                } else if (c == "e" || c == "E") && !text.isEmpty && !seenExponent {
                    // Lucide data has no exponents, but stopping mid-number on
                    // one would corrupt every coordinate after it.
                    seenExponent = true
                    text.append(c)
                    index += 1
                    if index < characters.count, characters[index] == "-" || characters[index] == "+" {
                        text.append(characters[index])
                        index += 1
                    }
                } else {
                    break
                }
            }
            guard !text.isEmpty, let value = Double(text) else { return nil }
            return CGFloat(value)
        }

        mutating func numbers(_ count: Int) -> [CGFloat]? {
            var group: [CGFloat] = []
            group.reserveCapacity(count)
            for _ in 0..<count {
                guard let value = number() else { return nil }
                group.append(value)
            }
            return group
        }

        /// A coordinate pair, resolved against the current point if relative.
        mutating func point(relativeTo current: CGPoint, isRelative: Bool) -> CGPoint? {
            guard let group = numbers(2) else { return nil }
            return isRelative
                ? CGPoint(x: current.x + group[0], y: current.y + group[1])
                : CGPoint(x: group[0], y: group[1])
        }
    }
}
