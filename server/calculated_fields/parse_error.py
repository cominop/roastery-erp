"""ParseError exception with position-aware error reporting."""


class ParseError(Exception):
    """Error raised during tokenisation or parsing with position info.

    Renders as:
        <message> at position <pos>
        <expression>
        <caret>
    """

    def __init__(self, message: str, position: int, expression: str) -> None:
        self.message = message
        self.position = position
        self.expression = expression
        super().__init__(self._format())

    def _format(self) -> str:
        # Clamp the caret position to the expression length
        caret_pos = min(self.position, len(self.expression))
        return (
            f"{self.message} at position {self.position}\n"
            f"{self.expression}\n"
            f"{' ' * caret_pos}^"
        )

    def __str__(self) -> str:
        return self._format()
