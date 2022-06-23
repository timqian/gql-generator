import { gql } from '@apollo/client';
export const MUTATION = gql`mutation updateBook($UpdateBookRequestSchema: UpdateBookRequestSchema!){
    updateBook(UpdateBookRequestSchema: $UpdateBookRequestSchema){
        author
        bookCategory{
            bookCategoryId
            bookCategoryName
            createdTime
            parentBookCategoryId
            updatedTime
        }
        bookCategoryId
        bookId
        bookName
        bookStatus
        contentsAgeType{
            contentsAgeTypeId
            contentsAgeTypeName
            createdTime
            updatedTime
        }
        contentsAgeTypeId
        createdTime
        description
        displayName
        isbn
        issn
        numOfPages
        pageList{
            bookId
            createdTime
            pageElement{
                bookId
                createdTime
                lSize{
                    height
                    width
                }
                hSize{
                    height
                    width
                }
                pageIndex
                updatedTime
            }
            pageIndex
            pageName
            updatedTime
        }
        pubDate
        pubEdition
        publisher
        size{
            height
            width
        }
        subject{
            createdTime
            subjectId
            subjectName
            updatedTime
        }
        subjectId
        updatedTime
    }
}`