import SwiftUI

/// A small label.
struct Tag<TrailingContent: View>: View {
    /// The text of the tag.
    let text: String
    /// How wide the border is.
    var borderWidth: CGFloat = 1
    var tint: Color = .blue
    var isSelected: Bool = false
    var level: Int?
    var onRemove: (() -> Void)?
    @Binding var count: Int
    @ViewBuilder var trailing: () -> TrailingContent
    @State private var hovering = false
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) var scheme
    @EnvironmentObject var theme: Theme
    @StateObject private var model = TagModel()
    let id = UUID()
    private var cache: [String] = []
    static let shared = 0

    var body: some View {
        Text(text)
    }

    var summary: String {
        "\(text) \(level ?? 0)"
    }
}
